import type { Note } from '../../../shared/types/note';
import { loadImage } from '../imageStore';
import { childrenOf, getNote } from '../store';
import { drawingFile } from '../editor/images/images';
import { pageAddress } from '../editor/links/links';
import { contentCopy, detailRows, exportFileName, hasRemarks, type ExportSettings } from './exportNotes';
import { dataUrl, downloadFile } from '../../lib/files';

/* What converting a page needs: the pages in the file (and the headings their links jump to), */
/* and the pictures, already loaded as data addresses (none for a text-only export). */
type Context = {
  anchors: Map<string, string>;
  pictures: Map<Element, string>;
};

const BLOCKS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'BLOCKQUOTE', 'PRE', 'HR', 'TABLE', 'DIV']);


/* =========================
   Text and Links
   ========================= */

/* Characters that Markdown would read as formatting are written with a backslash before them. */
export function escapeMarkdown(text: string) {
  return text.replace(/ /g, ' ').replace(/([\\`*_[\]<>|~])/g, '\\$1');
}

/* A line that would start a heading, list or quote is kept as plain text. */
function escapeLineStart(line: string) {
  return line.replace(/^(\s*)(#{1,6}\s|>|[-+]\s|\d+[.)]\s)/, '$1\\$2');
}

/* The anchor a heading gets in most Markdown viewers (GitHub, VS Code, Obsidian): lowercase, */
/* without punctuation or emoji, and with dashes for spaces. Repeated headings get -1, -2… */
export function headingAnchor(text: string, taken: Set<string>) {
  const base = text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s/g, '-');
  let anchor = base;
  for (let count = 1; taken.has(anchor); count++) anchor = `${base}-${count}`;
  taken.add(anchor);
  return anchor;
}

/* The heading a page's section starts with: its icon and title. */
function pageHeading(note: Note) {
  return `${note.icon ? `${note.icon} ` : ''}${note.title || 'Untitled note'}`;
}

function pageLink(id: string, context: Context) {
  const anchor = context.anchors.get(id);
  return anchor ? `#${anchor}` : pageAddress(id);
}

/* A run of text and inline formatting as Markdown. */
function inline(node: Node, context: Context): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeMarkdown(node.textContent ?? '');
  if (!(node instanceof Element)) return '';
  const inner = () => Array.from(node.childNodes).map(child => inline(child, context)).join('');
  const wrap = (mark: string) => {
    const text = inner();
    return text.trim() ? `${mark}${text}${mark}` : text;
  };

  if (node.classList.contains('page-block') || node.classList.contains('page-mention')) {
    const page = getNote((node as HTMLElement).dataset.page ?? '');
    return page ? `[${escapeMarkdown(pageHeading(page))}](${pageLink(page.id, context)})` : '';
  }
  if (node.classList.contains('image-block')) {
    const picture = context.pictures.get(node);
    return picture ? `![${node.classList.contains('drawing-block') ? 'Drawing' : 'Image'}](${picture})` : '';
  }

  switch (node.tagName) {
    case 'BR': return '  \n';
    case 'STRONG': case 'B': return wrap('**');
    case 'EM': case 'I': return wrap('*');
    case 'S': case 'STRIKE': return wrap('~~');
    case 'CODE': {
      const code = node.textContent ?? '';
      const fence = code.includes('`') ? '``' : '`';
      return code ? `${fence}${code}${fence}` : '';
    }
    case 'A': {
      const link = node as HTMLAnchorElement;
      const href = link.classList.contains('page-link') && link.dataset.page ? pageLink(link.dataset.page, context) : link.getAttribute('href');
      const text = inner();
      return href ? `[${text}](${href})` : text;
    }
    default: return inner();
  }
}


/* =========================
   Blocks
   ========================= */

/* A list as Markdown lines, its nested lists indented under their items. */
function list(element: Element, context: Context, indent = ''): string {
  const numbered = element.tagName === 'OL';
  return Array.from(element.children).filter(child => child.tagName === 'LI').map((item, index) => {
    const marker = numbered ? `${index + 1}. ` : '- ';
    const nested = Array.from(item.children).filter(child => child.tagName === 'UL' || child.tagName === 'OL');
    const text = Array.from(item.childNodes).filter(child => !nested.includes(child as Element)).map(child => inline(child, context)).join('').trim();
    const lines = [`${indent}${marker}${escapeLineStart(text).replace(/\n/g, `\n${indent}${' '.repeat(marker.length)}`)}`];
    nested.forEach(child => lines.push(list(child, context, indent + ' '.repeat(marker.length))));
    return lines.join('\n');
  }).join('\n');
}

/* A table as a Markdown table; its first row is the header. Merged cells repeat as empty cells. */
function table(element: Element, context: Context) {
  const rows = Array.from(element.querySelectorAll('tr')).map(row => Array.from(row.children).flatMap(cell => {
    const text = inline(cell, context).trim().replace(/\s*\n\s*/g, '<br>') || ' ';
    const span = Number(cell.getAttribute('colspan')) || 1;
    return [text, ...Array<string>(span - 1).fill(' ')];
  }));
  if (!rows.length) return '';
  const width = Math.max(...rows.map(row => row.length));
  const line = (cells: string[]) => `| ${[...cells, ...Array<string>(width - cells.length).fill(' ')].join(' | ')} |`;
  return [line(rows[0]), line(Array<string>(width).fill('---')), ...rows.slice(1).map(line)].join('\n');
}

/* One block of the text as Markdown, or '' for an empty one. */
function block(element: Element, context: Context): string {
  const heading = element.tagName.match(/^H([1-6])$/);
  if (heading) {
    const text = inline(element, context).trim();
    return text ? `${'#'.repeat(Math.min(5, Number(heading[1])))} ${text}` : '';
  }
  switch (element.tagName) {
    case 'P': return escapeLineStart(inline(element, context).trim());
    case 'UL': case 'OL': return list(element, context);
    case 'HR': return '---';
    case 'TABLE': return table(element, context);
    case 'PRE': {
      const code = element.querySelector('code');
      const language = code?.className.match(/language-([a-z]+)/)?.[1] ?? '';
      return `\`\`\`${language}\n${(code ?? element).textContent?.replace(/\n$/, '') ?? ''}\n\`\`\``;
    }
    case 'BLOCKQUOTE': return blocks(element, context).split('\n').map(line => (line ? `> ${line}` : '>')).join('\n');
    default:
      /* A toggle becomes a collapsible section; other groups (sticky groups) just hold blocks. */
      if (element.classList.contains('toggle-block')) {
        const summary = element.querySelector(':scope > .toggle-summary');
        const body = element.querySelector(':scope > .toggle-body');
        return `<details>\n<summary>${summary ? inline(summary, context).trim() : ''}</summary>\n\n${body ? blocks(body, context) : ''}\n\n</details>`;
      }
      return blocks(element, context);
  }
}

/* The blocks inside an element, separated by blank lines. Text sitting straight inside it (not */
/* in a line of its own) is gathered into paragraphs. */
function blocks(parent: Element, context: Context): string {
  const parts: string[] = [];
  let loose: Node[] = [];
  const flush = () => {
    const text = loose.map(node => inline(node, context)).join('').trim();
    if (text) parts.push(escapeLineStart(text));
    loose = [];
  };
  parent.childNodes.forEach(node => {
    if (node instanceof Element && BLOCKS.has(node.tagName)) {
      flush();
      const text = block(node, context);
      if (text) parts.push(text);
    } else {
      loose.push(node);
    }
  });
  flush();
  return parts.join('\n\n');
}


/* Some note HTML as Markdown, without pictures (used when copying from a note). Links to pages */
/* lead to their Starjot addresses, so pasting them into a note makes page links again. */
export function markdownOf(root: Element) {
  return blocks(root, { anchors: new Map(), pictures: new Map() });
}


/* =========================
   Pages
   ========================= */

/* Load the pictures a page's text shows as data addresses: images from the image store, and */
/* anchored drawings as SVG. Loose drawings, and drawings in front of the text, have no place in */
/* Markdown (it cannot put a picture over words), so they are left out. */
async function loadPictures(root: Element) {
  const pictures = new Map<Element, string>();
  await Promise.all(Array.from(root.querySelectorAll<HTMLElement>('.image-block')).map(async block => {
    if (block.classList.contains('drawing-block')) {
      if (block.dataset.wrap === 'front') return;
      pictures.set(block, await dataUrl(drawingFile(block)));
      return;
    }
    const file = await loadImage(block.dataset.image ?? '');
    if (file) pictures.set(block, await dataUrl(file));
  }));
  return pictures;
}

/* One page as Markdown: its icon and title as a heading, its details (when asked), then its text. */
async function pageMarkdown(note: Note, settings: ExportSettings, anchors: Map<string, string>) {
  const root = contentCopy(note.content);
  const pictures = settings.content === 'everything' ? await loadPictures(root) : new Map<Element, string>();
  const context = { anchors, pictures };
  const parts = [`# ${escapeMarkdown(pageHeading(note))}`];

  if (settings.details) {
    const chosen = settings.detailParts;
    const rows = detailRows(note, chosen).map(row => `**${row.label}:** ${escapeMarkdown(row.text)}`);
    if (rows.length) parts.push(rows.join('  \n'));
    if (chosen.remarks && hasRemarks(note)) parts.push(`**Remarks:**\n\n${blocks(contentCopy(note.remarks), context)}`);
    const pages = chosen.pages ? childrenOf(note.id) : [];
    if (pages.length) parts.push(`**Sub-notes:** ${pages.map(page => `[${escapeMarkdown(pageHeading(page))}](${pageLink(page.id, context)})`).join(', ')}`);
  }

  const text = blocks(root, context);
  if (text) parts.push(text);
  return parts.join('\n\n');
}

/* The notes as one Markdown file, each page after a divider. Links to pages in the file jump to */
/* their headings. */
export async function notesMarkdown(notes: Note[], settings: ExportSettings) {
  const taken = new Set<string>();
  const anchors = new Map(notes.map(note => [note.id, headingAnchor(pageHeading(note), taken)]));
  const pages = await Promise.all(notes.map(note => pageMarkdown(note, settings, anchors)));
  return `${pages.join('\n\n---\n\n')}\n`;
}

export async function exportMarkdown(notes: Note[], settings: ExportSettings) {
  const markdown = await notesMarkdown(notes, settings);
  downloadFile(exportFileName(notes[0].title, 'md'), new Blob([markdown], { type: 'text/markdown' }));
}
