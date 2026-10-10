import { describe, expect, it } from 'vitest';
import { editedText, newestFirst } from '../../src/frontend/notespace/NoteList';
import type { Note } from '../../src/shared/types/note';

/* Only the fields these helpers read are filled in. */
const note = (changes: Partial<Note>) => ({ id: 'n', title: 'Note', updated: '', updatedAt: null, ...changes }) as Note;


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
});
