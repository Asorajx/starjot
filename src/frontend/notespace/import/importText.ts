import { escapeHtml } from '../../lib/html';
import { splitIcon, type ImportedNote } from './imported';

/* Starjot's text export puts this line between notes. */
const NOTE_DIVIDER = `\n\n${'='.repeat(40)}\n\n`;

/* The details Starjot writes under a note's title, such as "Category: Work". */
const DETAIL = /^(Category|Description|Created): (.*)$/;

/* A table this long is shortened, so the note stays quick to open and edit. */
const MAX_ROWS = 1000;
const MAX_COLUMNS = 50;


/* =========================
   Plain Text
   ========================= */

/* Each line of text as its own line of the note, leaving out blank lines (they only separate */
/* paragraphs). */
function linesHtml(text: string) {
  return text.split('\n').filter(line => line.trim()).map(line => `<p>${escapeHtml(line.trimEnd())}</p>`).join('');
}

/* One note's part of a text file. As Starjot writes it: the title, underlined with "=", then the */
/* details, remarks (indented) and list of sub-notes, each a block of their own, then the text. */
function noteOf(text: string, key: string, fallbackTitle: string): ImportedNote {
  const lines = text.split('\n');
  const underline = (lines[1] ?? '').trimEnd();
  const titled = Boolean(lines[0]?.trim()) && /^=+$/.test(underline) && (underline.length >= 3 || underline.length === lines[0].trim().length);
  if (!titled) {
    return { key, title: fallbackTitle, content: () => linesHtml(text) };
  }

  const blocks = lines.slice(2).join('\n').replace(/^\n+/, '').split(/\n[ \t]*\n/);
  const details = new Map<string, string>();
  let remarks = '';
  if (blocks[0] && blocks[0].split('\n').every(line => DETAIL.test(line))) {
    blocks.shift()?.split('\n').forEach(line => {
      const [, label, value] = line.match(DETAIL) as RegExpMatchArray;
      details.set(label, value.trim());
    });
  }
  if (blocks[0]?.startsWith('Remarks:\n')) {
    /* Remarks are indented by four spaces, and may hold blank lines of their own. */
    const remarkLines = [blocks.shift()?.slice('Remarks:\n'.length) ?? ''];
    while (blocks[0]?.startsWith('    ')) remarkLines.push(blocks.shift() as string);
    remarks = linesHtml(remarkLines.join('\n').replace(/^ {4}/gm, ''));
  }
  if (blocks[0]?.startsWith('Sub-notes: ')) blocks.shift();

  const { icon, title } = splitIcon(lines[0]);
  return {
    key,
    title: title || fallbackTitle,
    icon,
    description: details.get('Description'),
    category: details.get('Category'),
    remarks,
    content: () => linesHtml(blocks.join('\n\n'))
  };
}

/* The notes in a text file. A Starjot export with sub-notes (its first part lists them) gives */
/* each sub-note back as a sub-note; any other file becomes one note. */
export function readText(text: string, fallbackTitle: string): ImportedNote[] {
  const plain = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const parts = plain.split(NOTE_DIVIDER);
  const exported = parts.length > 1 && /^Sub-notes: /m.test(parts[0]);
  return (exported ? parts : [plain]).map((part, index) => noteOf(part, String(index), fallbackTitle));
}


/* =========================
   CSV
   ========================= */

/* The separator a CSV file uses: a comma, semicolon or tab, whichever its first line has most of */
/* (outside quotes). */
function separatorOf(text: string) {
  const firstLine = text.split('\n')[0].replace(/"[^"]*"/g, '');
  return [',', ';', '\t'].reduce((best, separator) => (firstLine.split(separator).length > firstLine.split(best).length ? separator : best), ',');
}

/* The rows of a CSV file. A value in quotes may hold the separator, line breaks, and "" for a */
/* quote mark. */
export function csvRows(text: string) {
  const plain = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const separator = separatorOf(plain);
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < plain.length; index += 1) {
    const character = plain[index];
    if (quoted) {
      if (character === '"' && plain[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"' && !value) {
      quoted = true;
    } else if (character === separator) {
      row.push(value);
      value = '';
    } else if (character === '\n') {
      rows.push([...row, value]);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }
  if (value || row.length) rows.push([...row, value]);
  return rows.filter(cells => cells.some(cell => cell.trim()));
}

/* A CSV file as a note with one table, its first row the header row. */
export function readCsv(text: string, fallbackTitle: string): ImportedNote[] {
  const rows = csvRows(text);
  const width = Math.min(MAX_COLUMNS, Math.max(0, ...rows.map(row => row.length)));
  const cell = (tag: string, value: string) => `<${tag}>${value ? escapeHtml(value).replace(/\n/g, '<br>') : '<br>'}</${tag}>`;
  const lines = rows.slice(0, MAX_ROWS).map((row, index) => {
    const cells = Array.from({ length: width }, (_, column) => cell(index ? 'td' : 'th', row[column] ?? ''));
    return `<tr>${cells.join('')}</tr>`;
  });
  const shortened = rows.length > MAX_ROWS ? `<p><em>Only the first ${MAX_ROWS} rows were imported.</em></p>` : '';
  return [{
    key: 'main',
    title: fallbackTitle,
    content: () => (rows.length ? `<table class="fit-content"><tbody>${lines.join('')}</tbody></table>${shortened}` : '')
  }];
}
