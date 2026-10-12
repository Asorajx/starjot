import { describe, expect, it } from 'vitest';
import { readPdf } from '../../../../src/frontend/notespace/import/pdf/importPdf';
import { glyphText, parseToUnicode } from '../../../../src/frontend/notespace/import/pdf/pdfFonts';
import { blocksHtml, blocksOf } from '../../../../src/frontend/notespace/import/pdf/pdfLayout';
import type { TextPiece } from '../../../../src/frontend/notespace/import/pdf/pdfText';

/* A tiny PDF, written out by hand: each object in order, then a trailer. A stream given as bytes */
/* is stored compressed (FlateDecode). */
type PdfPart = string | { dict: string; data: string | Uint8Array };

function bytesOf(text: string) {
  return Uint8Array.from(text, character => character.charCodeAt(0));
}

async function compress(text: string) {
  const compressor = new CompressionStream('deflate');
  const writer = compressor.writable.getWriter();
  writer.write(bytesOf(text));
  writer.close();
  return new Uint8Array(await new Response(compressor.readable).arrayBuffer());
}

function pdf(objects: PdfPart[], trailer = '<< /Root 1 0 R >>') {
  const parts: Uint8Array[] = [bytesOf('%PDF-1.7\n')];
  objects.forEach((object, index) => {
    if (typeof object === 'string') {
      parts.push(bytesOf(`${index + 1} 0 obj\n${object}\nendobj\n`));
      return;
    }
    const data = typeof object.data === 'string' ? bytesOf(object.data) : object.data;
    parts.push(bytesOf(`${index + 1} 0 obj\n<< ${object.dict} /Length ${data.length} >>\nstream\n`), data, bytesOf('\nendstream\nendobj\n'));
  });
  parts.push(bytesOf(`trailer\n${trailer}\n%%EOF\n`));
  const all = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  parts.forEach(part => {
    all.set(part, offset);
    offset += part.length;
  });
  return all;
}

/* A one-page PDF using Helvetica, with the given drawing instructions. */
function simplePdf(content: string | Uint8Array, extra: PdfPart[] = [], trailer?: string) {
  return pdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    typeof content === 'string' ? { dict: '', data: content } : { dict: '/Filter /FlateDecode', data: content },
    ...extra
  ], trailer);
}

async function contentOf(bytes: Uint8Array) {
  const [note] = await readPdf(bytes, 'file');
  return { title: note.title, html: await note.content(() => undefined) };
}


/* =========================
   Fonts
   ========================= */

describe('PDF fonts', () => {
  it('reads glyph names as letters', () => {
    expect(glyphText('A')).toBe('A');
    expect(glyphText('quoteright')).toBe('’');
    expect(glyphText('uni00E9')).toBe('é');
    expect(glyphText('eacute')).toBe('é');
    expect(glyphText('f_i')).toBe('fi');
    expect(glyphText('a.sc')).toBe('a');
  });

  it('reads a ToUnicode map of single codes, ranges and lists', () => {
    const map = parseToUnicode('1 begincodespacerange <0000> <FFFF> endcodespacerange 2 beginbfchar <0001> <0048> <0002> <00660069> endbfchar 1 beginbfrange <0010> <0012> <0061> endbfrange 1 beginbfrange <0020> <0021> [<0058> <0059>] endbfrange');
    expect(map.codeLength).toBe(2);
    expect([1, 2, 0x10, 0x12, 0x20, 0x21].map(code => map.map.get(code))).toEqual(['H', 'fi', 'a', 'c', 'X', 'Y']);
  });
});


/* =========================
   Layout
   ========================= */

describe('PDF layout', () => {
  const piece = (text: string, x: number, y: number, size = 12): TextPiece => ({ text, x, y, size, width: text.length * size * 0.5 });

  it('joins lines into paragraphs, and starts a new one after a bigger gap', () => {
    const blocks = blocksOf([{ height: 792, pieces: [piece('One long line that', 72, 700), piece('goes on.', 72, 686), piece('A new para-', 72, 650), piece('graph.', 72, 636)] }]);
    expect(blocks).toEqual([{ kind: 'p', text: 'One long line that goes on.' }, { kind: 'p', text: 'A new paragraph.' }]);
  });

  it('finds headings by size, list items by their bullets, and leaves out page numbers', () => {
    const blocks = blocksOf([{ height: 792, pieces: [
      piece('Title', 72, 740, 24), piece('Section', 72, 700, 16), piece('Body text here.', 72, 670), piece('Body text again.', 72, 656),
      piece('• First', 72, 630), piece('• Second, which', 72, 616), piece('wraps.', 84, 602), piece('1. Numbered', 72, 580), piece('7', 300, 40)
    ] }]);
    expect(blocksHtml(blocks)).toBe('<h1>Title</h1><h2>Section</h2><p>Body text here. Body text again.</p><ul><li>First</li><li>Second, which wraps.</li></ul><ol><li>Numbered</li></ol>');
  });

  it('puts pieces of one line in order, with spaces where the gaps are', () => {
    const blocks = blocksOf([{ height: 792, pieces: [piece('world', 120, 700), piece('Hello', 72, 700)] }]);
    expect(blocks[0].text).toBe('Hello world');
  });
});


/* =========================
   Reading PDF Files
   ========================= */

describe('importing PDF', () => {
  it('reads text, its title, headings and paragraphs from a simple PDF', async () => {
    const content = 'BT /F1 24 Tf 72 700 Td (Big Title) Tj ET\nBT /F1 12 Tf 14 TL 72 660 Td (First line that) Tj T* (continues here.) Tj ET\nBT /F1 12 Tf 72 600 Td [(Hel) -20 (lo) -400 (again)] TJ ET';
    const result = await contentOf(simplePdf(content, ['<< /Title (My PDF) >>'], '<< /Root 1 0 R /Info 6 0 R >>'));
    expect(result).toEqual({ title: 'My PDF', html: '<h1>Big Title</h1><p>First line that continues here.</p><p>Hello again</p>' });
  });

  it('reads compressed instructions, and a font that maps its codes with a ToUnicode map', async () => {
    const cmap = '/CIDInit /ProcSet findresource begin begincmap 1 begincodespacerange <0000> <FFFF> endcodespacerange 1 beginbfrange <0001> <0002> [<0048> <0069>] endbfrange endcmap';
    const bytes = pdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type0 /BaseFont /Custom /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 7 0 R >>',
      { dict: '/Filter /FlateDecode', data: await compress('BT /F1 12 Tf 72 700 Td <00010002> Tj ET') },
      '<< /Type /Font /Subtype /CIDFontType2 /DW 600 >>',
      { dict: '', data: cmap }
    ]);
    expect((await contentOf(bytes)).html).toBe('<p>Hi</p>');
  });

  it('leaves out the DOCUMENT label and the title at the top of a Starjot PDF', async () => {
    const content = 'BT /F1 9 Tf 72 740 Td (DOCUMENT) Tj ET BT /F1 28 Tf 72 700 Td (Trip) Tj ET BT /F1 12 Tf 72 650 Td (Pack bags.) Tj ET';
    const result = await contentOf(simplePdf(content, ['<< /Title (Trip) >>'], '<< /Root 1 0 R /Info 6 0 R >>'));
    expect(result.html).toBe('<p>Pack bags.</p>');
  });

  it('explains files it cannot read', async () => {
    await expect(readPdf(bytesOf('hello'), 'file')).rejects.toThrow('This file is not a PDF.');
    await expect(readPdf(simplePdf('BT ET', [], '<< /Root 1 0 R /Encrypt 9 0 R >>'), 'file')).rejects.toThrow('protected');
    await expect(readPdf(simplePdf('0 0 10 10 re f'), 'file')).rejects.toThrow('No text was found');
  });
});
