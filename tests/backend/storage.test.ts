import { beforeEach, describe, expect, it } from 'vitest';
import { readNotes, writeNotes } from '../../src/backend/storage/notesStorage';
import { damagedCopies, readDamagedCopy } from '../../src/backend/storage/damagedCopies';
import { readPreferences, writePreferences } from '../../src/backend/storage/preferencesStorage';
import { readQuickNoteDraft, writeQuickNoteDraft } from '../../src/backend/storage/draftStorage';
import type { Note } from '../../src/shared/types/note';

/* Each test starts with empty browser storage. */
beforeEach(() => localStorage.clear());


/* =========================
   Notes Storage
   ========================= */

describe('notes storage', () => {
  it('reports nothing saved before anything is saved', () => {
    expect(readNotes()).toEqual({ status: 'empty' });
  });

  it('reads back the notes and deleted ids it saved', () => {
    const note = { id: 'n1', title: 'Hello' } as Note;
    writeNotes([note], ['atlas'], []);
    expect(readNotes()).toEqual({ status: 'ok', saved: { notes: [note], deleted: ['atlas'], trash: [] } });
  });

  it('keeps saved data in an unexpected shape, or broken JSON, aside instead of treating it as empty', () => {
    const shape = JSON.stringify({ notes: 'broken' });
    localStorage.setItem('starjot-notespace-v1', shape);
    expect(readNotes()).toEqual({ status: 'damaged', canSave: true });
    expect(readDamagedCopy('starjot-notespace-v1-damaged')).toBe(shape);

    localStorage.setItem('starjot-notespace-v1', '{"notes": [');
    expect(readNotes()).toEqual({ status: 'damaged', canSave: true });
    expect(readDamagedCopy('starjot-notespace-v1-damaged-2')).toBe('{"notes": [');
    expect(damagedCopies().map(copy => copy.key)).toEqual(['starjot-notespace-v1-damaged', 'starjot-notespace-v1-damaged-2']);
  });

  it('does not keep the same damaged data twice', () => {
    localStorage.setItem('starjot-notespace-v1', 'not json');
    readNotes();
    readNotes();
    expect(damagedCopies()).toHaveLength(1);
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


/* =========================
   Quick Note Draft
   ========================= */

describe('quick note draft', () => {
  it('keeps the draft until it is cleared', () => {
    expect(readQuickNoteDraft()).toBe('');
    writeQuickNoteDraft('Half a thought');
    expect(readQuickNoteDraft()).toBe('Half a thought');
    writeQuickNoteDraft('');
    expect(localStorage.getItem('starjot-quick-note-v1')).toBeNull();
  });
});
