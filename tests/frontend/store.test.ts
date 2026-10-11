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

  it('pins and unpins a note without changing when it was last edited', async () => {
    const store = await openApp();
    const note = store.createNote();
    const editedAt = store.getNote(note.id)?.updatedAt;
    store.setPinned(note.id, true);
    expect(store.getNote(note.id)?.pinned).toBe(true);
    expect(store.getNote(note.id)?.updatedAt).toBe(editedAt);
    store.setPinned(note.id, false);
    expect(store.getNote(note.id)?.pinned).toBe(false);
  });

  it('remembers when a note was opened without changing when it was edited', async () => {
    const store = await openApp();
    const editedAt = store.getNote('atlas')?.updatedAt;
    expect(store.getNote('atlas')?.openedAt).toBeNull();
    store.markOpened('atlas');
    expect(store.getNote('atlas')?.openedAt).not.toBeNull();
    expect(store.getNote('atlas')?.updatedAt).toBe(editedAt);
  });

  it('labels a note edited just now', async () => {
    const store = await openApp();
    const note = store.createNote();
    expect(store.updatedLabel(note)).toBe('Just now');
  });
});


/* =========================
   Categories
   ========================= */

describe('categories', () => {
  it('starts with Personal, Work and School', async () => {
    const store = await openApp();
    const names = () => store.categoryName('personal') + store.categoryName('work') + store.categoryName('school');
    expect(names()).toBe('PersonalWorkSchool');
  });

  it('allows at most 5 categories and no duplicate names', async () => {
    const store = await openApp();
    expect(store.addCategory('work')).toBeNull();
    expect(store.addCategory('Hobbies')).not.toBeNull();
    expect(store.addCategory('Travel')).not.toBeNull();
    expect(store.canAddCategory()).toBe(false);
    expect(store.addCategory('One too many')).toBeNull();
  });

  it('renames a category, keeping the old name when the new one is empty or taken', async () => {
    const store = await openApp();
    expect(store.renameCategory('school', 'University')).toBe(true);
    expect(store.categoryName('school')).toBe('University');
    expect(store.renameCategory('school', '   ')).toBe(false);
    expect(store.renameCategory('school', 'Work')).toBe(false);
    expect(store.categoryName('school')).toBe('University');
  });

  it('keeps notes from a removed category, without a category', async () => {
    const store = await openApp();
    const note = store.createNote('work');
    store.removeCategory('work');
    expect(store.getNote(note.id)?.category).toBe('');
    expect(store.categoryName('work')).toBe('');
  });

  it('moves notes saved with an old category name into the matching category', async () => {
    localStorage.setItem('strata-notespace-v1', JSON.stringify({ notes: [{ id: 'old1', title: 'Old', category: 'Projects' }], deleted: [] }));
    const store = await openApp();
    expect(store.getNote('old1')?.category).toBe('work');
  });
});


/* =========================
   Note Icons and Details
   ========================= */

describe('note icons and details', () => {
  it('starts new notes without an icon and keeps only emoji icons', async () => {
    const store = await openApp();
    const note = store.createNote();
    expect(note.icon).toBe('');
    store.updateNote(note.id, { icon: '📝' });
    expect(store.getNote(note.id)?.icon).toBe('📝');
    store.updateNote(note.id, { icon: 'layers' });
    expect(store.getNote(note.id)?.icon).toBe('');
  });

  it('drops the old named icons from saved notes', async () => {
    localStorage.setItem('strata-notespace-v1', JSON.stringify({ notes: [{ id: 'old2', title: 'Old', icon: 'layers' }], deleted: [] }));
    const store = await openApp();
    expect(store.getNote('old2')?.icon).toBe('');
  });

  it('saves the description and whether details are hidden', async () => {
    let store = await openApp();
    const note = store.createNote();
    store.updateNote(note.id, { subtitle: 'A short summary', detailsHidden: true });

    vi.resetModules();
    store = await openApp();
    expect(store.getNote(note.id)?.subtitle).toBe('A short summary');
    expect(store.getNote(note.id)?.detailsHidden).toBe(true);
  });
});


/* =========================
   Sub-pages
   ========================= */

describe('sub-pages', () => {
  it('creates a sub-page in the same category as its parent', async () => {
    const store = await openApp();
    const work = store.addCategory('Garden');
    const parent = store.createNote(work!.id);
    const child = store.createSubpage(parent.id);

    expect(child?.parentId).toBe(parent.id);
    expect(child?.category).toBe(work!.id);
    expect(store.childrenOf(parent.id).map(note => note.id)).toEqual([child!.id]);
  });

  it('lists the page above a sub-page', async () => {
    const store = await openApp();
    const top = store.createNote();
    const child = store.createSubpage(top.id)!;

    expect(store.ancestorsOf(child.id).map(note => note.id)).toEqual([top.id]);
    expect(store.depthOf(child.id)).toBe(2);
  });

  it('allows any number of sub-pages, but no sub-pages inside sub-pages', async () => {
    const store = await openApp();
    const top = store.createNote();
    const children = Array.from({ length: 12 }, () => store.createSubpage(top.id));

    expect(children.every(Boolean)).toBe(true);
    expect(store.childrenOf(top.id)).toHaveLength(12);
    expect(store.canAddSubpage(children[0]!.id)).toBe(false);
    expect(store.createSubpage(children[0]!.id)).toBeNull();
  });

  it('moves sub-pages up one level when their parent is deleted', async () => {
    const store = await openApp();
    const top = store.createNote();
    const child = store.createSubpage(top.id)!;

    store.deleteNote(top.id);
    expect(store.getNote(child.id)?.parentId).toBe('');
  });

  it('moves pages nested deeper than allowed up into their top-level note', async () => {
    const page = (id: string, parentId: string) => ({ id, title: id, content: '<p></p>', mode: 'structured', parentId });
    localStorage.setItem('strata-notespace-v1', JSON.stringify({
      version: 1,
      deleted: [],
      notes: [page('top', ''), page('middle', 'top'), page('deep', 'middle'), page('deeper', 'deep')]
    }));
    const store = await openApp();

    expect(store.getNote('middle')?.parentId).toBe('top');
    expect(store.getNote('deep')?.parentId).toBe('top');
    expect(store.getNote('deeper')?.parentId).toBe('top');
  });

  it('remembers whether the page list in the details is folded', async () => {
    let store = await openApp();
    const note = store.createNote();
    expect(store.getNote(note.id)?.pagesHidden).toBe(false);
    store.updateNote(note.id, { pagesHidden: true });

    vi.resetModules();
    store = await openApp();
    expect(store.getNote(note.id)?.pagesHidden).toBe(true);
  });

  it('keeps sub-pages inside their parent after reopening', async () => {
    let store = await openApp();
    const top = store.createNote();
    const child = store.createSubpage(top.id)!;
    store.save();

    vi.resetModules();
    store = await openApp();
    expect(store.getNote(child.id)?.parentId).toBe(top.id);
  });

  it('turns sub-pages with a missing parent, or in a loop, into top-level notes', async () => {
    const page = (id: string, parentId: string) => ({ id, title: id, content: '<p></p>', mode: 'structured', parentId });
    localStorage.setItem('strata-notespace-v1', JSON.stringify({
      version: 1,
      deleted: [],
      notes: [page('orphan', 'gone'), page('loop-a', 'loop-b'), page('loop-b', 'loop-a'), page('kept', 'atlas')]
    }));
    const store = await openApp();

    expect(store.getNote('orphan')?.parentId).toBe('');
    expect(store.getNote('loop-a')?.parentId).toBe('');
    expect(store.getNote('loop-b')?.parentId).toBe('');
    expect(store.getNote('kept')?.parentId).toBe('atlas');
  });
});
