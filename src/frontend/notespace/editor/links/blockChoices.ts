import type { IconName } from '../../../components/Icon';
import { getNote, updateNote } from '../../store';
import { blockWords, LINK_ID, linkableBlocks, linkIdOf } from './blockLinks';

/* One block to pick in Add link → Block: its place among the note's linkable blocks, its words */
/* and an icon for its kind. */
export type BlockChoice = { index: number; words: string; icon: IconName };

const BLOCK_ICONS: Record<string, IconName> = {
  H1: 'type', H2: 'type', H3: 'type', H4: 'type', H5: 'type',
  LI: 'list', BLOCKQUOTE: 'quote', PRE: 'file-code', TABLE: 'table'
};

/* A saved note's text, read without being shown: a template's contents never load pictures. */
function savedText(content: string) {
  const holder = document.createElement('template');
  holder.innerHTML = `<div>${content}</div>`;
  return holder.content.firstElementChild as HTMLElement;
}

/* The blocks of a note to choose from: from the open editor's text when it is given (the note */
/* being edited, which may not be saved yet), or else from the saved note. */
export function blockChoices(noteId: string, live: Element | null): BlockChoice[] {
  const content = live ? null : getNote(noteId)?.content;
  const root = live ?? (content === undefined || content === null ? null : savedText(content));
  if (!root) return [];
  return linkableBlocks(root).map((block, index) => ({ index, words: blockWords(block, 80), icon: BLOCK_ICONS[block.tagName] ?? 'align-left' }));
}

/* The link id of a chosen block, giving it one the first time. In the open editor's text the */
/* id is saved with the change that adds the link; in another note it is saved straight away. */
export function linkIdForBlock(noteId: string, index: number, live: Element | null) {
  if (live) {
    const block = linkableBlocks(live)[index];
    return block ? linkIdOf(block) : null;
  }
  const note = getNote(noteId);
  if (!note) return null;
  const root = savedText(note.content);
  const block = linkableBlocks(root)[index];
  if (!block) return null;
  if (LINK_ID.test(block.dataset.linkId ?? '')) return block.dataset.linkId as string;
  const id = linkIdOf(block);
  updateNote(noteId, { content: root.innerHTML });
  return id;
}
