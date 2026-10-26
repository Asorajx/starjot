import { beforeEach, describe, expect, it, vi } from 'vitest';

/* Each test opens fresh copies of the store and the kept sessions, like opening the app again. */
beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

async function openApp() {
  const store = await import('../../../../src/frontend/notespace/store');
  const sessions = await import('../../../../src/frontend/notespace/editor/sessions');
  return { ...store, ...sessions };
}


/* =========================
   Kept Sessions
   ========================= */

describe('kept editor sessions', () => {
  it('gives back the same session (and its undo) when a tab shows its note again', async () => {
    const app = await openApp();
    const note = app.createNote();
    const first = app.sessionFor('tab1', note.id);
    first.save('<p>typed</p>', null);
    const again = app.sessionFor('tab1', note.id);
    expect(again).toBe(first);
    expect(again.getSnapshot().canUndo).toBe(true);
  });

  it('keeps a separate session for each tab showing the same note', async () => {
    const app = await openApp();
    const note = app.createNote();
    expect(app.sessionFor('tab1', note.id)).not.toBe(app.sessionFor('tab2', note.id));
  });

  it('takes in a change made while the tab was away as one more undo step', async () => {
    const app = await openApp();
    const note = app.createNote();
    const session = app.sessionFor('tab1', note.id);
    session.view.caret = 4;
    app.updateNote(note.id, { content: '<p>changed elsewhere</p>' });
    const back = app.sessionFor('tab1', note.id);
    expect(back).toBe(session);
    expect(back.getSnapshot().canUndo).toBe(true);
    expect(back.pendingCaret).toBeNull();
  });

  it('puts the caret back where it was when nothing changed meanwhile', async () => {
    const app = await openApp();
    const note = app.createNote();
    app.sessionFor('tab1', note.id).view.caret = 7;
    expect(app.sessionFor('tab1', note.id).pendingCaret).toBe(7);
  });
});


/* =========================
   Two Panes on One Note
   ========================= */

describe('two panes editing one note', () => {
  it('does not save one pane over words just typed in the other', async () => {
    const app = await openApp();
    const note = app.createNote();
    const left = app.sessionFor('tab1', note.id);
    const right = app.sessionFor('tab2', note.id);
    left.save('<p>left words</p>', null);

    /* The right pane still shows the older copy when its next edit is saved. */
    right.save('<p>right words</p>', null);
    expect(app.getNote(note.id)?.content).toBe('<p>left words</p>');
    expect(right.getSnapshot().revision).toBe(1);

    /* Drawn again with the newer text, its next edit keeps both. */
    right.save('<p>left words right words</p>', null);
    expect(app.getNote(note.id)?.content).toBe('<p>left words right words</p>');
  });

  it('takes in the newer text instead of undoing over it', async () => {
    const app = await openApp();
    const note = app.createNote();
    const left = app.sessionFor('tab1', note.id);
    const right = app.sessionFor('tab2', note.id);
    right.save('<p>right words</p>', null);
    left.catchUp();
    left.save('<p>right words, then left</p>', null);
    right.undo();
    expect(app.getNote(note.id)?.content).toBe('<p>right words, then left</p>');
  });
});
