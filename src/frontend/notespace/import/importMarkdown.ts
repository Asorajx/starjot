import { markdownLines } from '../editor/text/paste';
import { pageAddress, setLinkTarget, unwrapLink } from '../editor/links/links';
import { LINK_ID, linkableBlock, linkableBlocks, linkIdOf } from '../editor/links/blockLinks';
import { headingAnchor } from '../export/exportMarkdown';
import { dataBlob, splitIcon, type IdOf, type ImportedNote } from './imported';
import { storedImageBlock } from '../editor/images/images';

/* The details Starjot writes under a note's title, such as "**Category:** Work". */
const DETAIL = /^\*\*(Category|Description|Created):\*\*\s?(.*?)\s*$/;

/* A picture: ![words](address). */
const PICTURE = /!\[([^\]\n]*)\]\(([^)\s]+)\)/g;

/* Pictures kept inside the text are swapped for a marker while the Markdown is read, so their */
/* long addresses are not read as words. These private characters never appear in normal text. */
const MARK_START = '';
const MARK_END = '';
const MARKER = new RegExp(`${MARK_START}(\\d+)${MARK_END}`, 'g');

/* A spot marked to link to, as Markdown files write it in HTML: <a id="…"></a> or <a name="…"></a> */
/* (on its own line before a block, or at the start of one). Starjot's exports mark linked blocks */
/* this way, with the block's own link id. Other HTML is not read. */
const HTML_ANCHOR = /<a\s+(?:id|name)\s*=\s*["']([^"'\s<>]+)["']\s*(?:\/>|>\s*<\/a>)/gi;

/* A link to a spot in the file, [words](#spot), is read as a link to this made-up address, then */
/* pointed at the block once every spot is known (see linkSpots). */
const SPOT_LINK = 'https://starjot.invalid/spot/';

/* Where a spot was, marked with other private characters while the Markdown is read. */
const SPOT_START = '';
const SPOT_END = '';
const SPOT = new RegExp(`${SPOT_START}([^${SPOT_END}]*)${SPOT_END}`, 'g');

/* Change the Markdown outside code blocks, so code showing HTML or links stays as written. */
function outsideCode(markdown: string, change: (line: string) => string) {
  let inCode = false;
  return markdown.split('\n').map(line => {
    if (/^\s*(```|~~~)/.test(line)) {
      inCode = !inCode;
      return line;
    }
    return inCode ? line : change(line);
  }).join('\n');
}

/* The spots marked in some Markdown (see HTML_ANCHOR), outside code. */
export function markedSpots(markdown: string) {
  const spots: string[] = [];
  outsideCode(markdown, line => {
    for (const match of line.matchAll(HTML_ANCHOR)) spots.push(match[1]);
    return line;
  });
  return spots;
}

/* The block each marked spot is on: the line it starts, or, for a spot alone on its line, the */
/* next block (whose first line it is). The spot's own empty line is removed. A spot named like a */
/* link id (as Starjot exports it) gives the block that id, so links to it work again. */
function placeSpots(root: HTMLElement) {
  const spots = new Map<string, HTMLElement>();
  const marked: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) if ((walker.currentNode.textContent ?? '').includes(SPOT_START)) marked.push(walker.currentNode as Text);

  for (const node of marked) {
    const names = Array.from((node.textContent ?? '').matchAll(SPOT), match => match[1]);
    node.textContent = (node.textContent ?? '').replace(SPOT, '');
    let block = linkableBlock(node, root);
    if (block && !block.textContent?.trim() && !block.querySelector('img, .image-block')) {
      const alone = block;
      const next = alone.nextElementSibling as HTMLElement | null;
      block = next ? linkableBlock(next.firstChild ?? next, root) ?? linkableBlocks(next)[0] ?? null : null;
      alone.remove();
    }
    if (!block) continue;
    names.forEach(name => {
      if (!spots.has(name)) spots.set(name, block as HTMLElement);
      if (LINK_ID.test(name) && !block?.dataset.linkId) (block as HTMLElement).dataset.linkId = name;
    });
  }

  /* Headings can be linked to by the anchor most Markdown viewers give them. */
  const taken = new Set<string>();
  root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5').forEach(heading => {
    const anchor = headingAnchor(heading.textContent ?? '', taken);
    if (!spots.has(anchor)) spots.set(anchor, heading);
  });
  return spots;
}

/* Point each link to a spot at its block: in this note, or in another note of the file (by the */
/* link id it was exported with). A link to a spot the file does not have keeps its words only. */
function linkSpots(root: HTMLElement, spots: Map<string, HTMLElement>, self: string | undefined, elsewhere: (spot: string) => string | undefined) {
  root.querySelectorAll<HTMLAnchorElement>(`a[href^="${SPOT_LINK}"]`).forEach(link => {
    let spot = '';
    try {
      spot = decodeURIComponent((link.getAttribute('href') ?? '').slice(SPOT_LINK.length));
    } catch {
      spot = '';
    }
    const block = spots.get(spot);
    const other = block ? undefined : elsewhere(spot);
    if (block && self) setLinkTarget(link, { kind: 'page', id: self, block: linkIdOf(block) });
    else if (other && LINK_ID.test(spot)) setLinkTarget(link, { kind: 'page', id: other, block: spot });
    else unwrapLink(link);
  });
}


/* =========================
   Text
   ========================= */

/* Markdown as note HTML. Links to a heading that starts another note of the file lead to that */
/* note, and links to a spot in the text (a heading or a marked block) lead to that block. */
/* Pictures kept inside the file become images; pictures on the web become links to them. */
/* self is this note's key; elsewhere gives the key of another note holding a marked spot. */
async function noteHtml(markdown: string, anchors: Map<string, string>, idOf: IdOf, self = '', elsewhere: Map<string, string> = new Map()) {
  const pictures: Blob[] = [];
  const text = markdown
    .replace(PICTURE, (_, words: string, address: string) => {
      const blob = dataBlob(address);
      if (!blob) return /^https?:/i.test(address) ? `[${words || address}](${address})` : words;
      pictures.push(blob);
      return `${MARK_START}${pictures.length - 1}${MARK_END}`;
    })
    .replace(/\]\(#([^)\s]+)\)/g, (whole, anchor: string) => {
      const id = idOf(anchors.get(anchor) ?? '');
      return id ? `](${pageAddress(id)})` : whole;
    });
  const spotted = outsideCode(text, line => line
    .replace(HTML_ANCHOR, (_, spot: string) => `${SPOT_START}${spot}${SPOT_END}`)
    .replace(/\]\(#([^)\s]+)\)/g, (_, spot: string) => `](${SPOT_LINK}${encodeURIComponent(spot)})`));

  const root = document.createElement('div');
  root.append(...markdownLines(spotted));
  linkSpots(root, placeSpots(root), idOf(self), spot => {
    const key = elsewhere.get(spot);
    return key && key !== self ? idOf(key) : undefined;
  });

  /* Put each picture where its marker is. */
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const marked: Text[] = [];
  while (walker.nextNode()) if ((walker.currentNode.textContent ?? '').includes(MARK_START)) marked.push(walker.currentNode as Text);
  for (const node of marked) {
    const parts: (Node | string)[] = [];
    let last = 0;
    for (const match of (node.textContent ?? '').matchAll(MARKER)) {
      parts.push((node.textContent ?? '').slice(last, match.index));
      parts.push(await storedImageBlock(pictures[Number(match[1])]));
      last = (match.index ?? 0) + match[0].length;
    }
    parts.push((node.textContent ?? '').slice(last));
    node.replaceWith(...parts.filter(part => part !== ''));
  }
  return root.innerHTML;
}


/* =========================
   Starjot Exports
   ========================= */

/* The blocks of a section of Markdown, split at blank lines (but not inside code). */
function blocksOf(markdown: string) {
  const blocks: string[] = [];
  let current: string[] = [];
  let inCode = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inCode = !inCode;
    if (!inCode && !line.trim()) {
      if (current.length) blocks.push(current.join('\n'));
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current.join('\n'));
  return blocks;
}

type Section = { heading: string; details: Map<string, string>; remarks: string; body: string };

/* One note's part of the file: a "# Title" heading, then (as Starjot writes them) its details, */
/* remarks and list of sub-notes, then its text. Remarks run up to the sub-notes list, or are one */
/* block when there is none. */
function sectionOf(markdown: string): Section {
  const heading = markdown.match(/^# (.+)$/m);
  const startsWithTitle = heading && markdown.trimStart().startsWith(heading[0]);
  if (!startsWithTitle) return { heading: '', details: new Map(), remarks: '', body: markdown };

  const blocks = blocksOf(markdown.trimStart().slice(heading[0].length));
  const details = new Map<string, string>();
  let remarks = '';
  if (blocks[0] && blocks[0].split('\n').every(line => DETAIL.test(line))) {
    blocks.shift()?.split('\n').forEach(line => {
      const [, label, value] = line.match(DETAIL) as RegExpMatchArray;
      details.set(label, value);
    });
  }
  if (blocks[0]?.trim() === '**Remarks:**') {
    blocks.shift();
    const listed = blocks.findIndex(block => block.startsWith('**Sub-notes:**'));
    remarks = blocks.splice(0, listed > 0 ? listed : 1).join('\n\n');
  }
  if (blocks[0]?.startsWith('**Sub-notes:**')) blocks.shift();
  return { heading: heading[1].trim(), details, remarks, body: blocks.join('\n\n') };
}


/* =========================
   Frontmatter
   ========================= */

/* Metadata at the very start of a file (as Obsidian, static site tools and many exports write */
/* it): a block opened by "---" on the first line and closed by "---" or "...". */
const FRONTMATTER = /^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/;

/* A line that belongs in frontmatter: "key: value", a list item, an indented (nested) line, a */
/* comment or a blank line. */
const META_LINE = /^(\s*$|[A-Za-z][\w-]*\s*:|\s+\S|-\s|#)/;

/* A file's frontmatter, read as simple "key: value" lines (keys in lower case, values without */
/* their quotes; lists and nested values are skipped), and the text after it. Nothing in it is */
/* shown as note text: Starjot uses the title and description, and leaves the rest out. A block */
/* holding anything else (text between two dividers, say) is not frontmatter, and stays text. */
export function splitFrontmatter(markdown: string) {
  const match = markdown.match(FRONTMATTER);
  if (!match || !match[1].split('\n').every(line => META_LINE.test(line))) return { meta: new Map<string, string>(), body: markdown };
  const meta = new Map<string, string>();
  match[1].split('\n').forEach(line => {
    const pair = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/);
    if (!pair || !pair[2]) return;
    meta.set(pair[1].toLowerCase(), pair[2].replace(/^(["'])(.*)\1$/, '$2'));
  });
  return { meta, body: markdown.slice(match[0].length).replace(/^\n+/, '') };
}


/* =========================
   Reading Markdown
   ========================= */

/* The notes in a Markdown file. A file that starts with a "# Title" heading takes its title from */
/* it, or else from its frontmatter's title (see splitFrontmatter), whose description becomes the */
/* note's. A Starjot export with sub-notes (its first part lists them) gives each sub-note back */
/* as a sub-note; anything else becomes one note. */
export function readMarkdown(text: string, fallbackTitle: string): ImportedNote[] {
  const { meta, body: markdown } = splitFrontmatter(text.replace(/^﻿/, '').replace(/\r\n?/g, '\n'));
  const parts = markdown.split(/\n\n---\n\n(?=# )/);
  const exported = parts.length > 1 && /^# /.test(markdown) && /^\*\*Sub-notes:\*\*/m.test(parts[0]);
  const sections = (exported ? parts : [markdown]).map(sectionOf);

  /* The headings link to each other the way the export named them, and blocks by their spots. */
  const taken = new Set<string>();
  const anchors = new Map(sections.map((section, index) => [headingAnchor(section.heading, taken), String(index)]));
  const spots = new Map<string, string>();
  sections.forEach((section, index) => markedSpots(section.body).forEach(spot => {
    if (!spots.has(spot)) spots.set(spot, String(index));
  }));

  return sections.map((section, index) => {
    const { icon, title } = splitIcon(section.heading || (index === 0 ? meta.get('title') ?? '' : ''));
    return {
      key: String(index),
      title: title || fallbackTitle,
      icon,
      description: section.details.get('Description') ?? (index === 0 ? meta.get('description') ?? meta.get('summary') : undefined),
      category: section.details.get('Category'),
      remarks: section.remarks ? markdownLines(section.remarks).map(line => line.outerHTML).join('') : '',
      content: idOf => noteHtml(section.body, anchors, idOf, String(index), spots)
    };
  });
}
