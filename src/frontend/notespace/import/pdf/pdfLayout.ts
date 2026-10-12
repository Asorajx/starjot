import { escapeHtml } from '../../../lib/html';
import type { PageText, TextPiece } from './pdfText';

/* A PDF only says where each piece of text goes, so its lines, paragraphs and headings are */
/* worked out from positions and sizes, much as a reader's eye does. */

/* A line of text on a page. */
type Line = { text: string; x: number; y: number; size: number; page: number };

/* A paragraph, heading or list item, made of one or more lines. */
export type Block = { kind: 'p' | 'h1' | 'h2' | 'h3' | 'ul' | 'ol'; text: string };

/* Marks that start a list item: bullets, or a number or letter followed by . or ). */
const BULLET = /^[•◦▪▫●○■□‣⁃∙·–\-*]\s+/;
const NUMBERED = /^\(?(\d{1,3}|[a-z])[.)]\s+/i;

/* A line that only shows a page number, such as "3", "Page 3" or "3 of 10". */
const PAGE_NUMBER = /^\s*(page\s*)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?\s*$/i;


/* =========================
   Lines
   ========================= */

/* Pieces whose baselines are this close (as a share of their size) are on the same line. */
const SAME_LINE = 0.5;

/* A gap wider than this share of the letter size between two pieces is a space between words. */
const WORD_GAP = 0.2;

/* The lines of one page, top to bottom, each read left to right. */
function linesOf(pieces: TextPiece[], page: number) {
  const sorted = [...pieces].sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: TextPiece[][] = [];
  for (const piece of sorted) {
    const group = groups[groups.length - 1];
    if (group && Math.abs(group[0].y - piece.y) < SAME_LINE * Math.min(group[0].size, piece.size || 1)) group.push(piece);
    else groups.push([piece]);
  }

  return groups.map((group): Line => {
    group.sort((a, b) => a.x - b.x);
    let text = '';
    let end = -Infinity;
    for (const piece of group) {
      const gap = piece.x - end;
      if (text && gap > WORD_GAP * piece.size && !/\s$/.test(text) && !/^\s/.test(piece.text)) text += ' ';
      text += piece.text;
      end = Math.max(end, piece.x + piece.width);
    }

    /* The line's size is the size most of its letters have. */
    const sizes = new Map<number, number>();
    group.forEach(piece => sizes.set(Math.round(piece.size * 2) / 2, (sizes.get(Math.round(piece.size * 2) / 2) ?? 0) + piece.text.length));
    const size = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return { text: text.replace(/\s+/g, ' ').trim(), x: group[0].x, y: group[0].y, size, page };
  }).filter(line => line.text);
}

/* The size of normal text: the size most letters in the document have. */
function bodySize(lines: Line[]) {
  const counts = new Map<number, number>();
  lines.forEach(line => counts.set(line.size, (counts.get(line.size) ?? 0) + line.text.length));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 12;
}

/* The usual distance between one line and the next in a paragraph, at the normal size. */
function lineSpacing(lines: Line[], body: number) {
  const counts = new Map<number, number>();
  for (let index = 1; index < lines.length; index += 1) {
    const [before, line] = [lines[index - 1], lines[index]];
    if (before.page !== line.page || before.size !== body || line.size !== body) continue;
    const distance = Math.round(before.y - line.y);
    if (distance > 0) counts.set(distance, (counts.get(distance) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? body * 1.2;
}


/* =========================
   Blocks
   ========================= */

/* Join a paragraph's lines, joining a word that was split with a hyphen at the end of a line. */
function joinLines(texts: string[]) {
  return texts.reduce((all, text) => (/[a-z]-$/.test(all) && /^[a-z]/.test(text) ? all.slice(0, -1) + text : all ? `${all} ${text}` : text), '');
}

/* The document's blocks: headings (text clearly bigger than normal, up to three sizes), list */
/* items and paragraphs. A new paragraph starts after a bigger gap than usual, a change of size, */
/* an indented first line, or a new page. Page numbers at the top or bottom of a page are left out. */
export function blocksOf(pages: PageText[]): Block[] {
  const lines = pages.flatMap((page, index) => {
    const own = linesOf(page.pieces, index);
    return own.filter((line, place) => !((place === 0 || place === own.length - 1) && PAGE_NUMBER.test(line.text)));
  });
  if (!lines.length) return [];

  const body = bodySize(lines);
  const spacing = lineSpacing(lines, body);
  const headingSizes = [...new Set(lines.filter(line => line.size >= body * 1.15).map(line => line.size))].sort((a, b) => b - a);
  const headingOf = (size: number): Block['kind'] => {
    const rank = headingSizes.indexOf(size);
    return rank < 0 ? 'p' : rank === 0 ? 'h1' : rank === 1 ? 'h2' : 'h3';
  };

  const blocks: { kind: Block['kind']; lines: string[]; left: number; last: Line }[] = [];
  for (const line of lines) {
    const current = blocks[blocks.length - 1];
    const kind = headingOf(line.size);
    const bullet = kind === 'p' && (BULLET.test(line.text) || NUMBERED.test(line.text));

    /* A line close under the last one, at the same size, carries on its block: a heading or */
    /* paragraph of the same kind (unless the line is indented, starting a paragraph), or a list */
    /* item whose words run onto the next line (lined up after its bullet, not under it). */
    const close = current && current.last.page === line.page && current.last.size === line.size && current.last.y - line.y <= spacing * 1.3;
    const listLine = (current?.kind === 'ul' || current?.kind === 'ol') && kind === 'p' && line.x > current.left + 1;
    const indented = kind === 'p' && current?.kind === 'p' && line.x > current.left + body * 1.5;
    if (current && close && !bullet && (listLine || (current.kind === kind && !indented))) {
      current.lines.push(line.text);
      current.last = line;
      current.left = Math.min(current.left, line.x);
      continue;
    }

    const text = bullet ? line.text.replace(BULLET.test(line.text) ? BULLET : NUMBERED, '') : line.text;
    blocks.push({ kind: bullet ? (BULLET.test(line.text) ? 'ul' : 'ol') : kind, lines: [text], left: line.x, last: line });
  }
  return blocks.map(block => ({ kind: block.kind, text: joinLines(block.lines) }));
}

/* Blocks as note HTML: list items next to each other share one list. */
export function blocksHtml(blocks: Block[]) {
  let html = '';
  let list = '';
  blocks.forEach(block => {
    const isList = block.kind === 'ul' || block.kind === 'ol';
    if (list && (!isList || block.kind !== list)) {
      html += `</${list}>`;
      list = '';
    }
    if (isList && !list) {
      list = block.kind;
      html += `<${list}>`;
    }
    const tag = isList ? 'li' : block.kind;
    html += `<${tag}>${escapeHtml(block.text)}</${tag}>`;
  });
  return list ? `${html}</${list}>` : html;
}
