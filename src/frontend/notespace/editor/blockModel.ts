import { LINE_TAGS } from './dom';


/* =========================
   Block Model
   ========================= */

/* Structured mode shows the note as a list of blocks; one block is one line of the document. */
/* group: blocks sharing a group id are stuck together (consecutive blocks only). */
/* version: increases when a block's HTML is replaced, so its editor element refreshes. */
export type DocBlock = {
  id: string;
  html: string;
  group: string | null;
  version: number;
};

export type BlockType = 'heading' | 'list' | 'quote' | 'code' | 'table' | 'toggle' | 'paragraph';

let nextId = 1;

export function newId(prefix = 'b') {
  nextId += 1;
  return `${prefix}${nextId}`;
}

export function makeBlock(html = '<p><br></p>', group: string | null = null): DocBlock {
  return { id: newId(), html, group, version: 0 };
}

export function blockType(html: string): BlockType {
  const tag = /^\s*<([a-z0-9]+)/i.exec(html)?.[1]?.toUpperCase() ?? 'P';
  if (/^H[1-6]$/.test(tag)) return 'heading';
  if (tag === 'UL' || tag === 'OL') return 'list';
  if (tag === 'BLOCKQUOTE') return 'quote';
  if (tag === 'PRE') return 'code';
  if (tag === 'TABLE') return 'table';
  if (/^\s*<div class="toggle-block/.test(html)) return 'toggle';
  return 'paragraph';
}

function escapeText(text: string) {
  return text.replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[character] ?? character));
}


/* =========================
   Reading and Writing HTML
   ========================= */

/* Each line of the continuous document becomes one block. */
/* Text joined by Shift + Enter line breaks stays together as one paragraph block. */
export function parseBlocks(html: string): DocBlock[] {
  const template = document.createElement('template');
  template.innerHTML = html;
  const blocks: DocBlock[] = [];

  const readContainer = (container: Node, group: string | null) => {
    let inline = '';
    const flushInline = () => {
      if (inline.replace(/<br\s*\/?>/gi, '').trim() || /<br/i.test(inline)) blocks.push(makeBlock(`<p>${inline}</p>`, group));
      inline = '';
    };

    container.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        inline += escapeText(node.textContent ?? '');
      } else if (!(node instanceof Element)) {
        return;
      } else if (node.classList.contains('sticky-group')) {
        /* Nested groups are flattened into the outer group. */
        flushInline();
        readContainer(node, group ?? newId('g'));
      } else if (LINE_TAGS.has(node.tagName)) {
        flushInline();
        blocks.push(makeBlock(node.outerHTML, group));
      } else {
        inline += node.outerHTML;
      }
    });
    flushInline();
  };

  readContainer(template.content, null);
  return blocks.length ? blocks : [makeBlock()];
}

/* Join blocks back into one HTML document, wrapping each sticky group in its own <div>. */
export function serializeBlocks(blocks: DocBlock[]) {
  let html = '';
  let openGroup: string | null = null;

  blocks.forEach(block => {
    if (block.group !== openGroup) {
      if (openGroup) html += '</div>';
      if (block.group) html += '<div class="sticky-group">';
      openGroup = block.group;
    }
    html += block.html;
  });
  if (openGroup) html += '</div>';
  return html;
}


/* =========================
   Sticky Groups in Blocks
   ========================= */

/* Keep every group in one consecutive run; a group split apart gets a new id for the later part. */
export function normalizeGroups(blocks: DocBlock[]) {
  const seen = new Set<string>();
  let previousOriginal: string | null = null;
  let previousAssigned: string | null = null;

  return blocks.map(block => {
    let group = block.group;
    if (group && group === previousOriginal) {
      group = previousAssigned;
    } else if (group) {
      if (seen.has(group)) group = newId('g');
      seen.add(block.group as string);
    }
    previousOriginal = block.group;
    previousAssigned = group;
    return group === block.group ? block : { ...block, group };
  });
}

export function isFirstInGroup(blocks: DocBlock[], index: number) {
  return Boolean(blocks[index]?.group) && blocks[index - 1]?.group !== blocks[index].group;
}

export function isLastInGroup(blocks: DocBlock[], index: number) {
  return Boolean(blocks[index]?.group) && blocks[index + 1]?.group !== blocks[index].group;
}

/* New lines never join a group from its edges: only a line added between two members joins it. */
export function groupForNewBlock(blocks: DocBlock[], index: number, position: 'above' | 'below') {
  const block = blocks[index];
  if (!block?.group) return null;
  if (position === 'below' && isLastInGroup(blocks, index)) return null;
  if (position === 'above' && isFirstInGroup(blocks, index)) return null;
  return block.group;
}

export type StickyState = 'none' | 'stick' | 'unstick';

/* Unstick only when everything selected belongs to one existing group. */
export function stickyStateFor(blocks: DocBlock[], ids: string[]): StickyState {
  const selected = blocks.filter(block => ids.includes(block.id));
  if (!selected.length) return 'none';
  const group = selected[0].group;
  return group && selected.every(block => block.group === group) ? 'unstick' : 'stick';
}

/* Stick everything from the first to the last selected block, merging any groups they touch. */
export function stickBlocks(blocks: DocBlock[], ids: string[]) {
  const indexes = blocks.map((block, index) => (ids.includes(block.id) ? index : -1)).filter(index => index >= 0);
  if (!indexes.length) return blocks;
  let start = Math.min(...indexes);
  let end = Math.max(...indexes);

  /* Extend the range to cover whole groups at either end. */
  while (start > 0 && blocks[start].group && blocks[start - 1].group === blocks[start].group) start -= 1;
  while (end < blocks.length - 1 && blocks[end].group && blocks[end + 1].group === blocks[end].group) end += 1;

  const group = newId('g');
  return blocks.map((block, index) => (index >= start && index <= end ? { ...block, group } : block));
}

export function unstickGroup(blocks: DocBlock[], group: string) {
  return blocks.map(block => (block.group === group ? { ...block, group: null } : block));
}
