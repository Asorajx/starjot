import { ImportError, type ImportedNote } from '../imported';
import { blocksHtml, blocksOf } from './pdfLayout';
import { PdfError, PdfFile } from './pdfObjects';
import { readPages } from './pdfText';


/* =========================
   Reading PDF
   ========================= */

/* Text stored in the document's information, such as its title: UTF-16 when it starts with a */
/* byte order mark, otherwise one byte per letter. */
function infoText(bytes: unknown) {
  if (!(bytes instanceof Uint8Array)) return '';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  return new TextDecoder('latin1').decode(bytes);
}

/* The title saved in the PDF, without the "Microsoft Word - " and file extension some apps add. */
function savedTitle(file: PdfFile) {
  const info = file.trailers.map(trailer => file.dict(trailer.get('Info'))).find(Boolean);
  const title = infoText(file.get(info?.get('Title'))).replace(/^Microsoft (Word|PowerPoint) - /, '').replace(/\.(docx?|pptx?|odt)$/i, '').trim();
  return /^untitled\b/i.test(title) ? '' : title;
}

/* A PDF as one note: its text, with paragraphs, headings and lists worked out from where the */
/* text sits. Pictures, tables and layout are not kept. Starjot's own PDF exports start with the */
/* word DOCUMENT and the title, which are left out as the note already shows them. */
export async function readPdf(bytes: Uint8Array, fallbackTitle: string): Promise<ImportedNote[]> {
  try {
    const file = await PdfFile.open(bytes);
    if (file.encrypted) throw new ImportError('This PDF is protected (encrypted), which Starjot cannot read yet.');
    const { pages, unreadable } = await readPages(file);
    const blocks = blocksOf(pages);
    if (!blocks.length) {
      throw new ImportError(unreadable
        ? 'The text in this PDF uses fonts Starjot cannot read yet.'
        : 'No text was found in this PDF. It may be a scan or a picture of text.');
    }

    const title = savedTitle(file) || fallbackTitle;
    if (blocks[0]?.text === 'DOCUMENT') blocks.shift();
    if (blocks[0]?.text === title) blocks.shift();
    const missing = unreadable ? '<p><em>Some text in this PDF uses fonts Starjot cannot read, so it was left out.</em></p>' : '';
    return [{ key: 'main', title, content: () => missing + blocksHtml(blocks) }];
  } catch (error) {
    if (error instanceof PdfError) throw new ImportError(error.message);
    throw error;
  }
}
