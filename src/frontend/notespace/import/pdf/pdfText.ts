import { loadFont, type PdfFont } from './pdfFonts';
import { isDict, isStream, nameOf, PdfLexer, PdfOperator, type PdfDict, type PdfFile, type PdfStream, type PdfValue } from './pdfObjects';

/* A piece of text as placed on a page: where its baseline starts (x to the right, y up from the */
/* bottom of the page), how big its letters are, and how wide it is, all in points. */
export type TextPiece = { text: string; x: number; y: number; size: number; width: number };

/* A page's text, and how tall the page is. */
export type PageText = { pieces: TextPiece[]; height: number };

/* A transformation (scale, turn and move), as six numbers [a b c d e f]. */
type Matrix = number[];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]
  ];
}

/* Form objects drawn inside each other deeper than this are skipped (only broken files do it). */
const MAX_DEPTH = 8;

/* The drawing state that q saves and Q brings back. */
type State = { ctm: Matrix; font: PdfFont | null; size: number; charSpacing: number; wordSpacing: number; scale: number; leading: number; rise: number };


/* =========================
   Reading a Page
   ========================= */

/* Reads the text out of one page's drawing instructions. */
class TextReader {
  readonly pieces: TextPiece[] = [];
  private fonts = new Map<PdfDict, Promise<PdfFont>>();

  /* True when some text could not be turned into letters. */
  unreadable = false;

  constructor(private file: PdfFile) {}

  private font(dict: PdfDict) {
    let font = this.fonts.get(dict);
    if (!font) {
      font = loadFont(this.file, dict);
      this.fonts.set(dict, font);
    }
    return font;
  }

  /* Follow the instructions in some content, keeping each piece of text shown. */
  async run(content: Uint8Array, resources: PdfDict | undefined, start: Matrix, depth = 0) {
    const { file } = this;
    const lexer = new PdfLexer(content);
    const fonts = file.dict(resources?.get('Font'));
    const objects = file.dict(resources?.get('XObject'));
    let state: State = { ctm: start, font: null, size: 0, charSpacing: 0, wordSpacing: 0, scale: 1, leading: 0, rise: 0 };
    const saved: State[] = [];
    let line: Matrix = IDENTITY;
    let text: Matrix = IDENTITY;
    let operands: PdfValue[] = [];
    const number = (index: number) => (typeof operands[index] === 'number' ? operands[index] as number : 0);
    const moveLine = (x: number, y: number) => {
      line = multiply([1, 0, 0, 1, x, y], line);
      text = line;
    };

    /* Show a string at the current position, then move along by its width. */
    const show = (bytes: Uint8Array) => {
      if (!state.font) return;
      if (!state.font.readable) this.unreadable = true;
      const glyphs = state.font.glyphs(bytes);
      let advance = 0;
      for (const glyph of glyphs) {
        advance += (glyph.width / 1000) * state.size + state.charSpacing + (glyph.space ? state.wordSpacing : 0);
      }
      advance *= state.scale;
      const placed = multiply([state.size * state.scale, 0, 0, state.size, 0, state.rise], multiply(text, state.ctm));
      const across = multiply(text, state.ctm);
      const words = glyphs.map(glyph => glyph.text).join('');
      if (words) {
        this.pieces.push({
          text: words,
          x: placed[4],
          y: placed[5],
          size: Math.hypot(placed[2], placed[3]),
          width: advance * Math.hypot(across[0], across[1])
        });
      }
      text = multiply([1, 0, 0, 1, advance, 0], text);
    };

    for (;;) {
      const value = lexer.read();
      if (value === undefined) break;
      if (!(value instanceof PdfOperator)) {
        if (value !== '>>' && value !== ']') operands.push(value);
        continue;
      }
      const name = value.op;
      if (name === 'BI') {
        /* A picture written straight into the instructions: skip its data, up to EI. */
        const end = findInlineImageEnd(content, lexer.pos);
        lexer.pos = end;
      } else if (name === 'q') {
        saved.push({ ...state });
      } else if (name === 'Q') {
        state = saved.pop() ?? state;
      } else if (name === 'cm') {
        state.ctm = multiply(operands.slice(0, 6).map((_, index) => number(index)), state.ctm);
      } else if (name === 'BT') {
        line = IDENTITY;
        text = IDENTITY;
      } else if (name === 'Tf') {
        const dict = fonts ? file.dict(fonts.get(nameOf(operands[0]))) : undefined;
        state.font = dict ? await this.font(dict) : null;
        state.size = number(1);
      } else if (name === 'Tc') {
        state.charSpacing = number(0);
      } else if (name === 'Tw') {
        state.wordSpacing = number(0);
      } else if (name === 'Tz') {
        state.scale = number(0) / 100;
      } else if (name === 'TL') {
        state.leading = number(0);
      } else if (name === 'Ts') {
        state.rise = number(0);
      } else if (name === 'Td') {
        moveLine(number(0), number(1));
      } else if (name === 'TD') {
        state.leading = -number(1);
        moveLine(number(0), number(1));
      } else if (name === 'Tm') {
        line = operands.slice(0, 6).map((_, index) => number(index));
        text = line;
      } else if (name === 'T*') {
        moveLine(0, -state.leading);
      } else if (name === 'Tj' && operands[0] instanceof Uint8Array) {
        show(operands[0]);
      } else if (name === "'" && operands[0] instanceof Uint8Array) {
        moveLine(0, -state.leading);
        show(operands[0]);
      } else if (name === '"' && operands[2] instanceof Uint8Array) {
        state.wordSpacing = number(0);
        state.charSpacing = number(1);
        moveLine(0, -state.leading);
        show(operands[2]);
      } else if (name === 'TJ' && Array.isArray(operands[0])) {
        /* A list of strings and spacing: numbers move left (in thousandths of the font size). */
        for (const item of operands[0]) {
          if (item instanceof Uint8Array) show(item);
          else if (typeof item === 'number') text = multiply([1, 0, 0, 1, (-item / 1000) * state.size * state.scale, 0], text);
        }
      } else if (name === 'Do' && depth < MAX_DEPTH) {
        /* A form object is a reusable piece of a page, which can hold text of its own. */
        const form = file.get(objects?.get(nameOf(operands[0])));
        if (isStream(form) && nameOf(form.dict.get('Subtype')) === 'Form') {
          const matrix = file.get(form.dict.get('Matrix'));
          const own = Array.isArray(matrix) && matrix.length === 6 ? matrix.map(item => (typeof item === 'number' ? item : 0)) : IDENTITY;
          const formResources = file.dict(form.dict.get('Resources')) ?? resources;
          await this.run(await file.data(form), formResources, multiply(own, state.ctm), depth + 1);
        }
      }
      operands = [];
    }
  }
}

/* Where a picture written into the instructions ends: after "EI" with a space or the end on */
/* each side. */
function findInlineImageEnd(content: Uint8Array, from: number) {
  for (let index = from; index < content.length - 1; index += 1) {
    if (content[index] === 69 && content[index + 1] === 73 && /\s/.test(String.fromCharCode(content[index - 1] ?? 32)) && (index + 2 >= content.length || /\s/.test(String.fromCharCode(content[index + 2])))) {
      return index + 2;
    }
  }
  return content.length;
}


/* =========================
   Pages
   ========================= */

/* The pages in reading order, each with the resources (fonts and forms) it inherits. */
function pagesOf(file: PdfFile) {
  const pages: { page: PdfDict; resources: PdfDict | undefined }[] = [];
  const seen = new Set<PdfDict>();
  const walk = (node: PdfDict | undefined, resources: PdfDict | undefined) => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    const own = file.dict(node.get('Resources')) ?? resources;
    const kids = file.get(node.get('Kids'));
    if (Array.isArray(kids)) kids.forEach(kid => walk(file.dict(kid), own));
    else if (nameOf(node.get('Type')) === 'Page' || node.has('Contents')) pages.push({ page: node, resources: own });
  };

  const root = file.trailers.map(trailer => file.dict(trailer.get('Root'))).find(Boolean);
  walk(file.dict(root?.get('Pages')), undefined);

  /* A damaged catalog: take every page object, in the order of their numbers. */
  if (!pages.length) {
    Array.from(file.values()).sort(([a], [b]) => a - b).forEach(([, value]) => {
      if (isDict(value) && nameOf(value.get('Type')) === 'Page') pages.push({ page: value, resources: file.dict(value.get('Resources')) });
    });
  }
  return pages;
}

/* A page's drawing instructions, joined when they are split over several streams. */
async function contentOf(file: PdfFile, page: PdfDict) {
  const contents = file.get(page.get('Contents'));
  const streams = (Array.isArray(contents) ? contents.map(item => file.get(item)) : [contents]).filter(isStream) as PdfStream[];
  const parts = await Promise.all(streams.map(stream => file.data(stream)));
  const all = new Uint8Array(parts.reduce((total, part) => total + part.length + 1, 0));
  let offset = 0;
  parts.forEach(part => {
    all.set(part, offset);
    all[offset + part.length] = 10;
    offset += part.length + 1;
  });
  return all;
}

/* The text on every page, and whether some of it could not be read. */
export async function readPages(file: PdfFile) {
  const pages: PageText[] = [];
  let unreadable = false;
  for (const { page, resources } of pagesOf(file)) {
    const reader = new TextReader(file);
    await reader.run(await contentOf(file, page), resources, IDENTITY);
    const box = file.get(page.get('MediaBox'));
    const height = Array.isArray(box) && typeof box[3] === 'number' ? box[3] : 792;
    pages.push({ pieces: reader.pieces, height });
    unreadable ||= reader.unreadable;
  }
  return { pages, unreadable };
}
