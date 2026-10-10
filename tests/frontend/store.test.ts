import { beforeEach, describe, expect, it, vi } from 'vitest';

/* The store loads saved notes when it is first imported, so each test clears storage */
/* and imports a fresh copy, like opening the app again. */
beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

function openApp() {
  return import('../../src/frontend/notespace/store');
}


/* =========================
   Note Store
   ========================= */

describe('note store', () => {
  it('starts with the sample notes', async () => {
    const store = await openApp();
    expect(store.getNote('atlas')?.title).toBe('Project Atlas — Research brief');
  });

  it('creates, cleans and saves a note so it is still there after reopening', async () => {
    let store = await openApp();
    const note = store.createNote();
    store.updateNote(note.id, { title: 'Shopping', content: '<p>Milk<script>alert(1)</script></p>' });

    expect(store.getNote(note.id)?.content).toBe('<p>Milk</p>');
    expect(store.getNote(note.id)?.preview).toBe('Milk');

    vi.resetModules();
    store = await openApp();
    expect(store.getNote(note.id)?.title).toBe('Shopping');
  });

  it('keeps a deleted sample note deleted after reopening', async () => {
    let store = await openApp();
    store.deleteNote('atlas');
    expect(store.getNote('atlas')).toBeUndefined();

    vi.resetModules();
    store = await openApp();
    expect(store.getNote('atlas')).toBeUndefined();
  });

  it('labels a note edited just now', async () => {
    const store = await openApp();
    const note = store.createNote();
    expect(store.updatedLabel(note)).toBe('Just now');
  });
});
