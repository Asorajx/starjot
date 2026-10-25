import { describe, expect, it } from 'vitest';
import { notesLinkingTo } from '../../../src/frontend/notespace/backlinks';
import type { Note } from '../../../src/shared/types/note';

const note = (id: string, content: string, updatedAt = '2026-10-01') => ({ id, content, updatedAt } as Note);


/* =========================
   Backlinks
   ========================= */

describe('notes linking to a note', () => {
  it('finds links and mentions, most recently edited first, leaving the note itself out', () => {
    const notes = [
      note('target', '<p><a class="page-link" data-page="target" href="#note=target">me</a></p>'),
      note('older', '<p>See <a class="page-link" data-page="target" href="#note=target">this</a></p>', '2026-09-01'),
      note('newer', '<p><span class="page-mention" data-page="target"></span></p>', '2026-10-20'),
      note('other', '<p><a class="page-link" data-page="elsewhere" href="#note=elsewhere">no</a></p>')
    ];
    expect(notesLinkingTo(notes, 'target').map(item => item.id)).toEqual(['newer', 'older']);
  });

  it('leaves out sub-note cards, which already show as sub-notes', () => {
    const notes = [note('parent', '<p><span class="page-block" data-page="child" data-size="small"></span></p>')];
    expect(notesLinkingTo(notes, 'child')).toEqual([]);
  });

  it('does not mistake a longer id that starts with the same letters', () => {
    const notes = [note('a', '<p><a class="page-link" data-page="target-2" href="#note=target-2">x</a></p>')];
    expect(notesLinkingTo(notes, 'target')).toEqual([]);
  });
});
