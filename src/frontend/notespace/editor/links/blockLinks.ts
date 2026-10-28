import { elementOf } from '../../../lib/nodes';
import { showToast } from '../../../lib/toasts';

/* A block's link id, given the first time something links to it and kept from then on (editing */
/* or moving the block keeps it; a copy pasted into the same note gets none of its own until it */
/* is linked; splitting a block leaves it on the first half). */
export const LINK_ID = /^l[a-z0-9]{6,24}$/;

/* The blocks a link can lead to. A table is one block, wherever in it the caret is. */
const LINKABLE = 'p, h1, h2, h3, h4, h5, li, blockquote, pre, table';

/* Things inside the text whose words are not the note's own: sub-note cards, mentions, reminders. */
const WIDGETS = '.page-block, .page-mention, .reminder-chip, [contenteditable="false"]';

/* How long a block shows it was reached by a link. */
const HIGHLIGHT_MS = 1600;


/* =========================
   Block Ids
   ========================= */

function newLinkId() {
  return `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/* The block a node sits in, inside the note's editable area (never the area itself). */
export function linkableBlock(node: Node | null, root: Element) {
  const element = elementOf(node);
  const block = element?.closest<HTMLElement>('table') ?? element?.closest<HTMLElement>(LINKABLE);
  return block && block !== root && root.contains(block) ? block : null;
}

/* The block's link id, giving it one when it has none. */
export function linkIdOf(block: HTMLElement) {
  if (!LINK_ID.test(block.dataset.linkId ?? '')) block.dataset.linkId = newLinkId();
  return block.dataset.linkId as string;
}

/* The blocks a link can lead to, in the order they appear: each block with words of its own, once. */
export function linkableBlocks(root: Element) {
  const found: HTMLElement[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim() || elementOf(node)?.closest(WIDGETS)) continue;
    const block = linkableBlock(node, root);
    if (block && !found.includes(block)) found.push(block);
  }
  return found;
}

/* A block's words, shortened, for a link's words or a list of blocks to pick from. A table's */
/* cells are kept apart by spaces. */
export function blockWords(block: Element, length = 60) {
  const text = block.tagName === 'TABLE'
    ? Array.from(block.querySelectorAll('td, th'), cell => cell.textContent ?? '').join(' ')
    : block.textContent ?? '';
  const words = text.replace(/\s+/g, ' ').trim();
  return words.length > length ? `${words.slice(0, length - 1).trimEnd()}…` : words;
}

/* A link id may be on one block only. A later block holding one already used (the second half */
/* of a split block, or a copy) loses it, so links keep leading to the first. */
export function dropRepeatedLinkIds(root: ParentNode) {
  const seen = new Set<string>();
  root.querySelectorAll<HTMLElement>('[data-link-id]:not(a)').forEach(block => {
    const id = block.dataset.linkId ?? '';
    if (seen.has(id)) block.removeAttribute('data-link-id');
    else seen.add(id);
  });
}

/* Pasted blocks (and blocks inside them) lose link ids the note already has, so a copy never */
/* takes the original's links. */
export function dropTakenLinkIds(pasted: Element[], note: Element) {
  pasted.flatMap(block => [block, ...Array.from(block.querySelectorAll<HTMLElement>('[data-link-id]'))]).forEach(block => {
    if (block.tagName === 'A' || !(block instanceof HTMLElement) || !block.dataset.linkId) return;
    if (note.querySelector(`[data-link-id="${CSS.escape(block.dataset.linkId)}"]:not(a)`)) block.removeAttribute('data-link-id');
  });
}


/* =========================
   Showing a Linked Block
   ========================= */

/* Scroll to the block with this link id and highlight it for a moment. When the block is gone */
/* (deleted since), the note stays where it is and a message says so. Returns whether it was found. */
export function revealBlock(root: Element | null, linkId: string) {
  const block = root?.querySelector<HTMLElement>(`[data-link-id="${CSS.escape(linkId)}"]:not(a)`);
  if (!block) {
    showToast({ kind: 'info', title: 'That part of the note is gone', description: 'The note is open; the block the link led to was deleted.' });
    return false;
  }
  /* The caret moves to the block too, so the editor does not scroll back to where it was. */
  if (block.isContentEditable) {
    const caret = document.createRange();
    caret.setStart(block, 0);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(caret);
  }
  block.scrollIntoView({ block: 'center', behavior: 'smooth' });
  block.classList.remove('is-link-target');
  void block.offsetWidth;
  block.classList.add('is-link-target');
  window.setTimeout(() => {
    block.classList.remove('is-link-target');
    if (!block.classList.length) block.removeAttribute('class');
  }, HIGHLIGHT_MS);
  return true;
}

/* A block link to another note opens that note; its editor then shows the block once it is on */
/* screen (see takeReveal). Only the next note shown uses it, within a minute. An editor already */
/* showing the note (when its address is opened again) is told at once. */
const REVEAL_WAIT_MS = 60000;
let pending: { noteId: string; linkId: string; at: number } | null = null;
const listeners = new Set<() => void>();

export function revealWhenShown(noteId: string, linkId: string) {
  pending = { noteId, linkId, at: Date.now() };
  listeners.forEach(listener => listener());
}

export function onRevealAsked(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* The block to show in this note, once; null when there is none. */
export function takeReveal(noteId: string) {
  if (pending?.noteId !== noteId) return null;
  const { linkId, at } = pending;
  pending = null;
  return Date.now() - at < REVEAL_WAIT_MS ? linkId : null;
}
