import type { Note } from '../../../shared/types/note';
import { childrenOf } from '../store';
import { contentCopy, detailRows, exportFileName, hasRemarks, type ExportSettings } from './exportNotes';
import { downloadFile } from '../../lib/files';

const BLOCKS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'BLOCKQUOTE', 'PRE', 'HR', 'TABLE', 'DIV']);

/* The line between pages in one file. */
const PAGE_DIVIDER = '='.repeat(40);


/* =========================
   Text
   ========================= */

/* A run of text as plain text. Pictures, drawings, page cards, page links and mentions are left */
/* out; other links keep their words. */
function inline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/ /g, ' ');
  if (!(node instanceof Element)) return '';
  if (node.matches('.image-block, .page-block, .page-mention, a.page-link')) return '';
  if (node.tagName === 'BR') return '\n';
  return Array.from(node.childNodes).map(inline).join('');
}

/* Indent every line of some text. */
function indent(text: string, by: string) {
  return text.split('\n').map(line => (line ? `${by}${line}` : line)).join('\n');
}

function list(element: Element, depth = 0): string {
  const numbered = element.tagName === 'OL';
  return Array.from(element.children).filter(child => child.tagName === 'LI').map((item, index) => {
    const marker = numbered ? `${index + 1}. ` : '• ';
    const nested = Array.from(item.children).filter(child => child.tagName === 'UL' || child.tagName === 'OL');
    const text = Array.from(item.childNodes).filter(child => !nested.includes(child as Element)).map(inline).join('').trim();
    const lines = [`${'  '.repeat(depth)}${marker}${text.replace(/\n/g, `\n${'  '.repeat(depth)}${' '.repeat(marker.length)}`)}`];
    nested.forEach(child => lines.push(list(child, depth + 1)));
    return lines.join('\n');
  }).join('\n');
}

/* One block of the text, or '' for an empty one. Tables put a tab between cells; a toggle's */
/* title is followed by its contents, indented. */
function block(element: Element): string {
  switch (element.tagName) {
    case 'UL': case 'OL': return list(element);
    case 'HR': return '-'.repeat(20);
    case 'TABLE':
      return Array.from(element.querySelectorAll('tr')).map(row => Array.from(row.children).map(cell => inline(cell).trim().replace(/\s*\n\s*/g, ' ')).join('\t')).join('\n');
    case 'PRE': return indent(element.textContent?.replace(/\n$/, '') ?? '', '    ');
    case 'BLOCKQUOTE': return indent(blocks(element), '> ');
    case 'DIV':
      if (element.classList.contains('toggle-block')) {
        const summary = element.querySelector(':scope > .toggle-summary');
        const body = element.querySelector(':scope > .toggle-body');
        return [summary ? inline(summary).trim() : '', body ? indent(blocks(body), '    ') : ''].filter(Boolean).join('\n');
      }
      return blocks(element);
    default: return inline(element).trim();
  }
}

/* The blocks inside an element, separated by blank lines. */
function blocks(parent: Element): string {
  const parts: string[] = [];
  let loose = '';
  const flush = () => {
    if (loose.trim()) parts.push(loose.trim());
    loose = '';
  };
  parent.childNodes.forEach(node => {
    if (node instanceof Element && BLOCKS.has(node.tagName)) {
      flush();
      const text = block(node);
      if (text.trim()) parts.push(text);
    } else {
      loose += inline(node);
    }
  });
  flush();
  return parts.join('\n\n');
}


/* =========================
   Pages
   ========================= */

/* One page as plain text: its title (underlined), its details (when asked), then its text. */
function pageText(note: Note, settings: ExportSettings) {
  const title = `${note.icon ? `${note.icon} ` : ''}${note.title || 'Untitled note'}`;
  const parts = [`${title}\n${'='.repeat(Math.min(40, title.length))}`];
  if (settings.details) {
    const chosen = settings.detailParts;
    const rows = detailRows(note, chosen).map(row => `${row.label}: ${row.text}`);
    if (rows.length) parts.push(rows.join('\n'));
    if (chosen.remarks && hasRemarks(note)) parts.push(`Remarks:\n${indent(blocks(contentCopy(note.remarks)), '    ')}`);
    const pages = chosen.pages ? childrenOf(note.id) : [];
    if (pages.length) parts.push(`Sub-notes: ${pages.map(page => page.title || 'Untitled note').join(', ')}`);
  }
  const text = blocks(contentCopy(note.content));
  if (text) parts.push(text);
  return parts.join('\n\n');
}

/* The notes as one plain text file, each page after a divider line. */
export function notesText(notes: Note[], settings: ExportSettings) {
  return `${notes.map(note => pageText(note, settings)).join(`\n\n${PAGE_DIVIDER}\n\n`)}\n`;
}

export function exportText(notes: Note[], settings: ExportSettings) {
  downloadFile(exportFileName(notes[0].title, 'txt'), new Blob([notesText(notes, settings)], { type: 'text/plain' }));
}
