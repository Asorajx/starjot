import { isStream, latin1, nameOf, type PdfDict, type PdfFile, type PdfValue } from './pdfObjects';

/* A PDF does not store letters: it stores codes that pick shapes from a font. A font may carry a */
/* table from codes to letters (its "ToUnicode" map); otherwise simple fonts use a standard */
/* encoding, maybe with some codes renamed by glyph name. */

/* One shape drawn: the letters it stands for, its width in thousandths of the font size, and */
/* whether it is the space character (word spacing only applies to that one). */
export type Glyph = { text: string; width: number; space: boolean };

export type PdfFont = {
  glyphs: (bytes: Uint8Array) => Glyph[];

  /* False when the font gives no way to know its letters. */
  readable: boolean;
};


/* =========================
   Glyph Names
   ========================= */

/* Common glyph names that are not simply the letter itself. */
const GLYPH_NAMES: Record<string, string> = {
  space: ' ', exclam: '!', quotedbl: '"', numbersign: '#', dollar: '$', percent: '%', ampersand: '&', quotesingle: "'",
  parenleft: '(', parenright: ')', asterisk: '*', plus: '+', comma: ',', hyphen: '-', period: '.', slash: '/',
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  colon: ':', semicolon: ';', less: '<', equal: '=', greater: '>', question: '?', at: '@', bracketleft: '[',
  backslash: '\\', bracketright: ']', asciicircum: '^', underscore: '_', grave: '`', braceleft: '{', bar: '|',
  braceright: '}', asciitilde: '~', quoteleft: '‘', quoteright: '’', quotedblleft: '“',
  quotedblright: '”', quotesinglbase: '‚', quotedblbase: '„', bullet: '•', endash: '–',
  emdash: '—', ellipsis: '…', fi: 'fi', fl: 'fl', ff: 'ff', ffi: 'ffi', ffl: 'ffl', copyright: '©',
  registered: '®', trademark: '™', degree: '°', section: '§', paragraph: '¶', dagger: '†',
  daggerdbl: '‡', periodcentered: '·', minus: '−', multiply: '×', divide: '÷', nbspace: ' ',
  nonbreakingspace: ' ', germandbls: 'ß', ae: 'æ', AE: 'Æ', oslash: 'ø', Oslash: 'Ø',
  euro: '€', sterling: '£', yen: '¥', cent: '¢', guillemotleft: '«', guillemotright: '»',
  exclamdown: '¡', questiondown: '¿', plusminus: '±', mu: 'µ', onehalf: '½', onequarter: '¼',
  threequarters: '¾', dotlessi: 'ı', arrowright: '→', arrowleft: '←', checkmark: '✓'
};

/* Accents a glyph name can end with, as combining marks. */
const ACCENTS: Record<string, string> = {
  acute: '́', grave: '̀', circumflex: '̂', dieresis: '̈', tilde: '̃', ring: '̊', cedilla: '̧', caron: '̌'
};

/* The letters a glyph name stands for, such as "A", "quoteright", "uni00E9" or "eacute". */
export function glyphText(name: string): string {
  const base = name.split('.')[0];
  if (GLYPH_NAMES[base] !== undefined) return GLYPH_NAMES[base];
  if (/^[A-Za-z]$/.test(base)) return base;
  if (/^uni([0-9A-F]{4})+$/i.test(base)) return base.slice(3).match(/.{4}/g)?.map(code => String.fromCharCode(parseInt(code, 16))).join('') ?? '';
  const unicode = base.match(/^u([0-9A-F]{4,6})$/i);
  if (unicode) return String.fromCodePoint(parseInt(unicode[1], 16));
  const accented = base.match(/^([A-Za-z])(acute|grave|circumflex|dieresis|tilde|ring|cedilla|caron)$/);
  if (accented) return (accented[1] + ACCENTS[accented[2]]).normalize('NFC');
  if (base.includes('_')) return base.split('_').map(glyphText).join('');
  return '';
}


/* =========================
   Encodings
   ========================= */

function decoder(label: string) {
  try {
    return new TextDecoder(label);
  } catch {
    return new TextDecoder('windows-1252');
  }
}

const DECODERS = { WinAnsiEncoding: decoder('windows-1252'), MacRomanEncoding: decoder('macintosh') };

/* The letter for a one-byte code in a standard encoding. Most fonts use WinAnsi (Windows Latin). */
/* The older Standard encoding differs mainly in its quote marks. */
function standardText(code: number, encoding: string) {
  if (encoding === 'StandardEncoding' && code === 0x27) return '’';
  if (encoding === 'StandardEncoding' && code === 0x60) return '‘';
  const chosen = encoding === 'MacRomanEncoding' ? DECODERS.MacRomanEncoding : DECODERS.WinAnsiEncoding;
  return chosen.decode(Uint8Array.of(code));
}


/* =========================
   ToUnicode Maps
   ========================= */

/* Letters written in hexadecimal UTF-16, as a ToUnicode map writes them. */
function utf16(hex: string) {
  const units = hex.match(/.{1,4}/g) ?? [];
  return String.fromCharCode(...units.map(unit => parseInt(unit.padEnd(4, '0'), 16)));
}

/* A ToUnicode map: codes to letters, and how many bytes each code takes. */
export function parseToUnicode(text: string) {
  const map = new Map<number, string>();
  const space = text.match(/begincodespacerange\s*<([0-9a-f]+)>/i);
  const codeLength = space ? Math.ceil(space[1].length / 2) : 0;

  for (const [, body] of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const [, code, letters] of body.matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]*)>/gi)) map.set(parseInt(code, 16), utf16(letters));
  }
  for (const [, body] of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const [, low, high, target] of body.matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*(<[0-9a-f]*>|\[[^\]]*\])/gi)) {
      const from = parseInt(low, 16);
      const to = Math.min(parseInt(high, 16), from + 65535);
      if (target.startsWith('[')) {
        /* A list gives each code in the range its own letters. */
        const each = Array.from(target.matchAll(/<([0-9a-f]*)>/gi), match => match[1]);
        each.forEach((letters, index) => map.set(from + index, utf16(letters)));
      } else {
        /* One starting point: each later code is the next letter on. */
        const start = target.slice(1, -1);
        const head = start.slice(0, -4);
        const last = parseInt(start.slice(-4) || '0', 16);
        for (let code = from; code <= to; code += 1) map.set(code, utf16(head) + String.fromCharCode(last + code - from));
      }
    }
  }
  return { map, codeLength };
}


/* =========================
   Loading Fonts
   ========================= */

/* The widths of a composite font's glyphs, from its /W list: "code [w1 w2 …]" gives widths from */
/* that code on, and "first last w" gives one width to a range. */
function compositeWidths(file: PdfFile, list: PdfValue | undefined) {
  const widths = new Map<number, number>();
  const entries = file.get(list);
  if (!Array.isArray(entries)) return widths;
  for (let index = 0; index < entries.length;) {
    const first = file.get(entries[index]);
    const next = file.get(entries[index + 1]);
    if (typeof first !== 'number') break;
    if (Array.isArray(next)) {
      next.forEach((width, offset) => {
        const value = file.get(width);
        if (typeof value === 'number') widths.set(first + offset, value);
      });
      index += 2;
    } else {
      const width = file.get(entries[index + 2]);
      if (typeof next === 'number' && typeof width === 'number') for (let code = first; code <= Math.min(next, first + 65535); code += 1) widths.set(code, width);
      index += 3;
    }
  }
  return widths;
}

/* A font, ready to turn a string's bytes into glyphs. */
export async function loadFont(file: PdfFile, font: PdfDict): Promise<PdfFont> {
  const subtype = nameOf(file.lookup(font, 'Subtype'));
  const composite = subtype === 'Type0';
  const toUnicodeStream = file.lookup(font, 'ToUnicode');
  const toUnicode = isStream(toUnicodeStream) ? parseToUnicode(latin1(await file.data(toUnicodeStream))) : null;
  const codeLength = toUnicode?.codeLength || (composite ? 2 : 1);

  /* Widths: composite fonts list them on their descendant font; simple fonts from FirstChar on. */
  const encodingValue = file.get(font.get('Encoding'));
  let widthOf: (code: number) => number;
  if (composite) {
    const descendants = file.get(font.get('DescendantFonts'));
    const descendant = file.dict(Array.isArray(descendants) ? descendants[0] : undefined);
    const fallback = file.lookup(descendant, 'DW');
    const widths = compositeWidths(file, descendant?.get('W'));
    widthOf = code => widths.get(code) ?? (typeof fallback === 'number' ? fallback : 1000);
  } else {
    const first = file.lookup(font, 'FirstChar');
    const list = file.lookup(font, 'Widths');
    const descriptor = file.dict(font.get('FontDescriptor'));
    const missing = file.lookup(descriptor, 'MissingWidth');
    const matrix = file.lookup(font, 'FontMatrix');

    /* Type 3 fonts draw in their own units, which FontMatrix turns into text units. */
    const scale = subtype === 'Type3' && Array.isArray(matrix) && typeof matrix[0] === 'number' ? matrix[0] * 1000 : 1;
    const standard = /Courier/i.test(nameOf(file.lookup(font, 'BaseFont'))) ? 600 : 500;
    widthOf = code => {
      const width = Array.isArray(list) && typeof first === 'number' ? file.get(list[code - first]) : undefined;
      return (typeof width === 'number' ? width : typeof missing === 'number' && missing > 0 ? missing : standard) * scale;
    };
  }

  /* Letters for codes the ToUnicode map does not cover: by encoding, with renamed codes. */
  const differences = new Map<number, string>();
  let encoding = nameOf(encodingValue);
  const encodingDict = file.dict(encodingValue);
  if (encodingDict) {
    encoding = nameOf(file.lookup(encodingDict, 'BaseEncoding'));
    const list = file.lookup(encodingDict, 'Differences');
    let code = 0;
    if (Array.isArray(list)) {
      list.forEach(entry => {
        if (typeof entry === 'number') code = entry;
        else differences.set(code++, glyphText(nameOf(entry)));
      });
    }
  }

  /* Some composite fonts use codes that are already Unicode (UCS-2). */
  const unicodeCodes = composite && /UCS2|UTF16/i.test(encoding);
  const letters = (code: number) => {
    const mapped = toUnicode?.map.get(code);
    if (mapped !== undefined) return mapped;
    if (unicodeCodes) return String.fromCharCode(code);
    if (composite) return '';
    return differences.get(code) ?? standardText(code, encoding);
  };

  return {
    readable: Boolean(toUnicode) || !composite || unicodeCodes,
    glyphs: bytes => {
      const glyphs: Glyph[] = [];
      for (let index = 0; index + codeLength <= bytes.length; index += codeLength) {
        let code = 0;
        for (let byte = 0; byte < codeLength; byte += 1) code = code * 256 + bytes[index + byte];
        glyphs.push({ text: letters(code), width: widthOf(code), space: codeLength === 1 && code === 32 });
      }
      return glyphs;
    }
  };
}
