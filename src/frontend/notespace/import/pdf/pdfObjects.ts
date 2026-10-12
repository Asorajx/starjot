/* A small reader for the parts of a PDF file that hold text. A PDF is a list of numbered objects */
/* (numbers, names, strings, lists, dictionaries and streams of data) that refer to each other. */
/* This reads every object it can find, without relying on the file's own index, so slightly */
/* damaged files still work. */


/* =========================
   Values
   ========================= */

/* A name, written /Name in the file. */
export class PdfName {
  constructor(readonly name: string) {}
}

/* A reference to another object, written "12 0 R". */
export class PdfRef {
  constructor(readonly num: number, readonly gen: number) {}
}

/* An instruction in a page's drawing commands, such as Tj (show text). */
export class PdfOperator {
  constructor(readonly op: string) {}
}

export type PdfDict = Map<string, PdfValue>;

/* A stream: its dictionary, and its data as stored (often compressed). */
export type PdfStream = { dict: PdfDict; raw: Uint8Array };

/* Strings are kept as bytes, as their meaning depends on the font they are shown in. */
export type PdfValue = number | boolean | null | Uint8Array | PdfName | PdfRef | PdfOperator | PdfValue[] | PdfDict | PdfStream;

export function isDict(value: unknown): value is PdfDict {
  return value instanceof Map;
}

export function isStream(value: unknown): value is PdfStream {
  return typeof value === 'object' && value !== null && 'raw' in value && 'dict' in value;
}

export function nameOf(value: unknown) {
  return value instanceof PdfName ? value.name : '';
}

/* A problem that means the file cannot be read at all. */
export class PdfError extends Error {}


/* =========================
   Reading Values
   ========================= */

const SPACE = new Set([0, 9, 10, 12, 13, 32]);

/* Bytes as text, one character per byte (fine for the plain ASCII parts of a PDF). */
export function latin1(bytes: Uint8Array) {
  return new TextDecoder('latin1').decode(bytes);
}
const DELIMITERS = new Set([...'()<>[]{}/%'].map(character => character.charCodeAt(0)));

/* Reads values one at a time from some bytes of the file. */
export class PdfLexer {
  pos: number;

  constructor(readonly bytes: Uint8Array, start = 0) {
    this.pos = start;
  }

  /* Move past spaces and comments (% to the end of the line). */
  skipSpace() {
    const { bytes } = this;
    while (this.pos < bytes.length) {
      const byte = bytes[this.pos];
      if (SPACE.has(byte)) {
        this.pos += 1;
      } else if (byte === 37) {
        while (this.pos < bytes.length && bytes[this.pos] !== 10 && bytes[this.pos] !== 13) this.pos += 1;
      } else {
        break;
      }
    }
  }

  /* A word up to the next space or delimiter, such as a number or a keyword. */
  private word() {
    const start = this.pos;
    while (this.pos < this.bytes.length && !SPACE.has(this.bytes[this.pos]) && !DELIMITERS.has(this.bytes[this.pos])) this.pos += 1;
    return String.fromCharCode(...this.bytes.subarray(start, this.pos));
  }

  /* (A literal string), with its escapes and nested brackets. */
  private literal() {
    const { bytes } = this;
    const out: number[] = [];
    let depth = 1;
    this.pos += 1;
    while (this.pos < bytes.length) {
      const byte = bytes[this.pos++];
      if (byte === 40) depth += 1;
      if (byte === 41 && --depth === 0) break;
      if (byte !== 92) {
        out.push(byte);
        continue;
      }
      const next = bytes[this.pos++];
      const escapes: Record<number, number> = { 110: 10, 114: 13, 116: 9, 98: 8, 102: 12 };
      if (escapes[next] !== undefined) {
        out.push(escapes[next]);
      } else if (next >= 48 && next <= 55) {
        /* Up to three octal digits, such as \101 for "A". */
        let code = next - 48;
        for (let count = 0; count < 2 && bytes[this.pos] >= 48 && bytes[this.pos] <= 55; count += 1) code = code * 8 + bytes[this.pos++] - 48;
        out.push(code & 255);
      } else if (next === 13 || next === 10) {
        /* A backslash at the end of a line joins the lines. */
        if (next === 13 && bytes[this.pos] === 10) this.pos += 1;
      } else {
        out.push(next);
      }
    }
    return Uint8Array.from(out);
  }

  /* <48656C6C6F>, a string written in hexadecimal. */
  private hex() {
    const end = this.bytes.indexOf(62, this.pos);
    const digits = latin1(this.bytes.subarray(this.pos + 1, end < 0 ? this.bytes.length : end)).replace(/[^0-9a-f]/gi, '');
    this.pos = end < 0 ? this.bytes.length : end + 1;
    const padded = digits.length % 2 ? `${digits}0` : digits;
    return Uint8Array.from({ length: padded.length / 2 }, (_, index) => parseInt(padded.slice(index * 2, index * 2 + 2), 16));
  }

  /* The next value or instruction, or undefined at the end. Dictionaries and lists are read whole. */
  read(): PdfValue | undefined | '>>' | ']' {
    this.skipSpace();
    const { bytes } = this;
    if (this.pos >= bytes.length) return undefined;
    const byte = bytes[this.pos];

    if (byte === 40) return this.literal();
    if (byte === 60 && bytes[this.pos + 1] === 60) {
      this.pos += 2;
      const dict: PdfDict = new Map();
      for (;;) {
        const key = this.read();
        if (key === '>>' || key === undefined) break;
        const value = this.read();
        if (key instanceof PdfName && value !== '>>' && value !== ']' && value !== undefined) dict.set(key.name, value);
      }
      return dict;
    }
    if (byte === 60) return this.hex();
    if (byte === 62 && bytes[this.pos + 1] === 62) {
      this.pos += 2;
      return '>>';
    }
    if (byte === 91) {
      this.pos += 1;
      const list: PdfValue[] = [];
      for (;;) {
        const value = this.read();
        if (value === ']' || value === undefined) break;
        if (value !== '>>') list.push(value);
      }
      return list;
    }
    if (byte === 93) {
      this.pos += 1;
      return ']';
    }
    if (byte === 47) {
      this.pos += 1;
      return new PdfName(this.word().replace(/#([0-9a-f]{2})/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16))));
    }
    if (DELIMITERS.has(byte)) {
      /* A stray { } > or ), which only appear in broken files. */
      this.pos += 1;
      return this.read();
    }

    const word = this.word();
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) {
      /* "12 0 R" is a reference: look ahead for the second number and the R. */
      const number = Number(word);
      if (/^\d+$/.test(word)) {
        const saved = this.pos;
        this.skipSpace();
        const generation = this.word();
        this.skipSpace();
        if (/^\d+$/.test(generation) && bytes[this.pos] === 82 && (this.pos + 1 >= bytes.length || SPACE.has(bytes[this.pos + 1]) || DELIMITERS.has(bytes[this.pos + 1]))) {
          this.pos += 1;
          return new PdfRef(number, Number(generation));
        }
        this.pos = saved;
      }
      return number;
    }
    if (word === 'true') return true;
    if (word === 'false') return false;
    if (word === 'null') return null;
    return new PdfOperator(word);
  }
}


/* =========================
   Unpacking Streams
   ========================= */

/* Join pieces of data into one. */
function joined(chunks: Uint8Array[]) {
  const all = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  chunks.forEach(chunk => {
    all.set(chunk, offset);
    offset += chunk.length;
  });
  return all;
}

/* Unpack compressed data with the browser's own decompressor. Data with a damaged end keeps */
/* what was unpacked before the damage. */
async function unpack(data: Uint8Array, format: CompressionFormat) {
  const decompressor = new DecompressionStream(format);
  const writer = decompressor.writable.getWriter();
  writer.write(new Uint8Array(data)).catch(() => undefined);
  writer.close().catch(() => undefined);
  const reader = decompressor.readable.getReader();
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } catch {
    /* Keep what was read. */
  }
  return joined(chunks);
}

/* Flate data normally starts with a two-byte zlib header, but a few files leave it out. */
async function inflate(data: Uint8Array) {
  const unpacked = await unpack(data, 'deflate');
  return unpacked.length ? unpacked : unpack(data, 'deflate-raw');
}

/* Hexadecimal digits, ending at >. */
function asciiHex(data: Uint8Array) {
  const digits = latin1(data).split('>')[0].replace(/[^0-9a-f]/gi, '');
  const padded = digits.length % 2 ? `${digits}0` : digits;
  return Uint8Array.from({ length: padded.length / 2 }, (_, index) => parseInt(padded.slice(index * 2, index * 2 + 2), 16));
}

/* Base-85 text, five characters for every four bytes, ending at ~>. */
function ascii85(data: Uint8Array) {
  const text = latin1(data).split('~>')[0].replace(/\s/g, '').replace(/^<~/, '');
  const out: number[] = [];
  let group: number[] = [];
  const flush = (count: number) => {
    while (group.length < 5) group.push(84);
    const value = group.reduce((total, digit) => total * 85 + digit, 0);
    for (let index = 0; index < count; index += 1) out.push((value >>> (24 - index * 8)) & 255);
    group = [];
  };
  for (const character of text) {
    if (character === 'z' && !group.length) {
      out.push(0, 0, 0, 0);
      continue;
    }
    group.push(character.charCodeAt(0) - 33);
    if (group.length === 5) flush(4);
  }
  if (group.length) flush(group.length - 1);
  return Uint8Array.from(out);
}

/* A stream's data unpacked, following its filters in order. A filter this reader does not know */
/* (such as image compression) gives no data. */
export async function streamData(stream: PdfStream) {
  const filter = stream.dict.get('Filter');
  const filters = (Array.isArray(filter) ? filter : filter ? [filter] : []).map(nameOf);
  let data = stream.raw;
  for (const name of filters) {
    if (name === 'FlateDecode' || name === 'Fl') data = await inflate(data);
    else if (name === 'ASCIIHexDecode' || name === 'AHx') data = asciiHex(data);
    else if (name === 'ASCII85Decode' || name === 'A85') data = ascii85(data);
    else return new Uint8Array();
  }
  return data;
}


/* =========================
   The File
   ========================= */

/* Every object of a PDF, by number, and the trailer dictionaries that say where to start. */
export class PdfFile {
  private objects = new Map<number, PdfValue>();
  private decoded = new Map<PdfStream, Promise<Uint8Array>>();
  readonly trailers: PdfDict[] = [];

  private constructor(readonly bytes: Uint8Array) {}

  static async open(bytes: Uint8Array) {
    const head = latin1(bytes.subarray(0, 1024));
    if (!head.includes('%PDF-')) throw new PdfError('This file is not a PDF.');
    const file = new PdfFile(bytes);
    file.scan();
    await file.unpackObjectStreams();
    return file;
  }

  /* Find each "12 0 obj … endobj" in the file. When an object appears more than once (a file */
  /* that was changed and saved again), the later one is the current one. */
  private scan() {
    const { bytes } = this;
    const text = latin1(bytes);
    const start = /(\d+)\s+(\d+)\s+obj\b/g;
    for (let match = start.exec(text); match; match = start.exec(text)) {
      if (match.index > 0 && /\d/.test(text[match.index - 1])) continue;
      const lexer = new PdfLexer(bytes, match.index + match[0].length);
      const value = lexer.read();
      if (value === undefined || value === '>>' || value === ']') continue;
      lexer.skipSpace();
      if (isDict(value) && text.startsWith('stream', lexer.pos)) {
        const stream = this.readStream(value, lexer.pos + 6, text);
        this.objects.set(Number(match[1]), stream.value);
        start.lastIndex = stream.end;
      } else {
        this.objects.set(Number(match[1]), value);
        start.lastIndex = lexer.pos;
      }
    }

    /* Trailers name the document's catalog and information. */
    const trailer = /trailer\s*<</g;
    for (let match = trailer.exec(text); match; match = trailer.exec(text)) {
      const value = new PdfLexer(bytes, match.index + 7).read();
      if (isDict(value)) this.trailers.push(value);
    }
    this.objects.forEach(value => {
      if (isStream(value) && nameOf(value.dict.get('Type')) === 'XRef') this.trailers.push(value.dict);
    });
  }

  /* A stream's data starts after the end of its "stream" line and runs for /Length bytes, or */
  /* (when the length is missing or wrong) up to "endstream". */
  private readStream(dict: PdfDict, after: number, text: string) {
    let start = after;
    if (this.bytes[start] === 13) start += 1;
    if (this.bytes[start] === 10) start += 1;
    const length = dict.get('Length');
    let end = typeof length === 'number' ? start + length : -1;
    if (end < 0 || !text.startsWith('endstream', end + (text.slice(end, end + 2).match(/^\s*/)?.[0].length ?? 0))) {
      end = text.indexOf('endstream', start);
      if (end < 0) end = this.bytes.length;
      while (end > start && (this.bytes[end - 1] === 10 || this.bytes[end - 1] === 13)) end -= 1;
    }
    return { value: { dict, raw: this.bytes.subarray(start, end) } as PdfStream, end };
  }

  /* Newer PDFs keep many small objects packed together in one compressed "object stream". */
  private async unpackObjectStreams() {
    const packs = Array.from(this.objects.values()).filter((value): value is PdfStream => isStream(value) && nameOf(value.dict.get('Type')) === 'ObjStm');
    for (const pack of packs) {
      const data = await this.data(pack);
      const count = pack.dict.get('N');
      const first = pack.dict.get('First');
      if (typeof count !== 'number' || typeof first !== 'number') continue;
      const header = new PdfLexer(data);
      const entries: [number, number][] = [];
      for (let index = 0; index < count; index += 1) {
        const num = header.read();
        const offset = header.read();
        if (typeof num === 'number' && typeof offset === 'number') entries.push([num, offset]);
      }
      entries.forEach(([num, offset]) => {
        if (this.objects.has(num)) return;
        const value = new PdfLexer(data, first + offset).read();
        if (value !== undefined && value !== '>>' && value !== ']') this.objects.set(num, value);
      });
    }
  }

  /* A value itself, following a reference to the object it names. */
  get(value: PdfValue | undefined): PdfValue | undefined {
    for (let hops = 0; value instanceof PdfRef && hops < 32; hops += 1) value = this.objects.get(value.num);
    return value instanceof PdfRef ? undefined : value;
  }

  /* A dictionary entry, followed through references. A stream's dictionary stands for the stream. */
  lookup(dict: PdfDict | PdfStream | undefined, key: string) {
    const map = isStream(dict) ? dict.dict : dict;
    return this.get(map?.get(key));
  }

  dict(value: PdfValue | undefined) {
    const found = this.get(value);
    return isDict(found) ? found : isStream(found) ? found.dict : undefined;
  }

  /* A stream's data, unpacked once and remembered. */
  data(stream: PdfStream) {
    let found = this.decoded.get(stream);
    if (!found) {
      found = streamData(stream);
      this.decoded.set(stream, found);
    }
    return found;
  }

  /* True when the file is encrypted, which this reader cannot undo. */
  get encrypted() {
    return this.trailers.some(trailer => trailer.has('Encrypt'));
  }

  /* Every object, for finding the pages when the catalog is damaged. */
  values() {
    return this.objects.entries();
  }
}
