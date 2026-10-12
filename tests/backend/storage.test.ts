import { beforeEach, describe, expect, it } from 'vitest';
import { readNotes, writeNotes } from '../../src/backend/storage/notesStorage';
import { readPreferences, writePreferences } from '../../src/backend/storage/preferencesStorage';
import type { Note } from '../../src/shared/types/note';

/* Each test starts with empty browser storage. */
beforeEach(() => localStorage.clear());


/* =========================
   Notes Storage
   ========================= */

describe('notes storage', () => {
  it('returns null before anything is saved', () => {
    expect(readNotes()).toBeNull();
  });

  it('reads back the notes and deleted ids it saved', () => {
    const note = { id: 'n1', title: 'Hello' } as Note;
    writeNotes([note], ['atlas']);
    expect(readNotes()).toEqual({ notes: [note], deleted: ['atlas'] });
  });

  it('ignores saved data in an unexpected shape', () => {
    localStorage.setItem('starjot-notespace-v1', JSON.stringify({ notes: 'broken' }));
    expect(readNotes()).toBeNull();
  });
});


/* =========================
   Preferences Storage
   ========================= */

describe('preferences storage', () => {
  it('saves and reads preferences', () => {
    writePreferences({ theme: 'dark', zoom: 1.2 });
    expect(readPreferences()).toEqual({ theme: 'dark', zoom: 1.2 });
  });

  it('returns an empty object for unreadable data', () => {
    localStorage.setItem('starjot-preferences-v1', 'not json');
    expect(readPreferences()).toEqual({});
  });
});
