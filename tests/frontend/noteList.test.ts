import { describe, expect, it } from 'vitest';
import { editedText, newestFirst, openedLabel, sortNotes } from '../../src/frontend/notespace/NoteList';
import type { Note } from '../../src/shared/types/note';

/* Only the fields these helpers read are filled in. */
const note = (changes: Partial<Note>) => ({ id: 'n', title: 'Note', updated: '', updatedAt: null, openedAt: null, ...changes }) as Note;


/* =========================
   Note List Helpers
   ========================= */

describe('note list helpers', () => {
  it('sorts notes newest first', () => {
    const older = note({ id: 'a', updatedAt: '2026-10-01T00:00:00.000Z' });
    const newer = note({ id: 'b', updatedAt: '2026-10-05T00:00:00.000Z' });
    expect(newestFirst([older, newer]).map(item => item.id)).toEqual(['b', 'a']);
  });

  it('writes "Edited" once, including for sample notes that already say it', () => {
    expect(editedText(note({ updatedAt: new Date().toISOString() }))).toBe('Edited just now');
    expect(editedText(note({ updated: 'Edited yesterday' }))).toBe('Edited yesterday');
  });

  it('sorts by name from A to Z, ignoring case and reading numbers as numbers', () => {
    const notes = [note({ id: 'b', title: 'beta' }), note({ id: 'c', title: 'Note 10' }), note({ id: 'a', title: 'Alpha' }), note({ id: 'd', title: 'Note 2' })];
    expect(sortNotes(notes, 'title').map(item => item.id)).toEqual(['a', 'b', 'd', 'c']);
  });

  it('sorts by last opened, with notes never opened last', () => {
    const never = note({ id: 'never' });
    const old = note({ id: 'old', openedAt: '2026-10-01T00:00:00.000Z' });
    const recent = note({ id: 'recent', openedAt: '2026-10-09T00:00:00.000Z' });
    expect(sortNotes([never, old, recent], 'opened').map(item => item.id)).toEqual(['recent', 'old', 'never']);
    expect(openedLabel(never)).toBe('Not opened yet');
  });
});
