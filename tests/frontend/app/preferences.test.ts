import { beforeEach, describe, expect, it, vi } from 'vitest';

/* Preferences are read when the module is first imported, so each test imports a fresh copy. */
beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

function openApp() {
  return import('../../../src/frontend/app/preferences');
}


/* =========================
   App Preferences
   ========================= */

describe('preferences', () => {
  it('zooms in steps of 10% and stays between 50% and 200%', async () => {
    const preferences = await openApp();
    const zoom = () => JSON.parse(localStorage.getItem('starjot-preferences-v1') ?? '{}').zoom;

    preferences.changeZoom(1);
    expect(zoom()).toBe(1.1);
    for (let step = 0; step < 20; step += 1) preferences.changeZoom(1);
    expect(zoom()).toBe(2);
    for (let step = 0; step < 30; step += 1) preferences.changeZoom(-1);
    expect(zoom()).toBe(0.5);
    preferences.changeZoom(0);
    expect(zoom()).toBe(1);
  });

  it('starts comfortable, and remembers compact density on <html>', async () => {
    const preferences = await openApp();
    expect(preferences.getPreferences().density).toBe('comfortable');
    preferences.updatePreferences({ density: 'compact' });
    expect(document.documentElement.dataset.density).toBe('compact');
    vi.resetModules();
    expect((await openApp()).getPreferences().density).toBe('compact');
  });

  it('starts by following the computer, so it opens dark when the computer prefers dark', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes('dark'), media: query })) as unknown as typeof window.matchMedia;
    try {
      const preferences = await openApp();
      expect(preferences.getPreferences().theme).toBe('system');
      expect(preferences.shownTheme()).toBe('dark');
    } finally {
      window.matchMedia = original;
    }
  });

  it('applies the theme to the page and remembers it', async () => {
    let preferences = await openApp();
    preferences.updatePreferences({ theme: 'dark' });
    expect(document.documentElement.dataset.theme).toBe('dark');

    vi.resetModules();
    document.documentElement.removeAttribute('data-theme');
    preferences = await openApp();
    preferences.applyTheme();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('slides smoothly to headings by default and remembers an instant jump', async () => {
    let preferences = await openApp();
    expect(preferences.getPreferences().contentsScroll).toBe('smooth');
    preferences.updatePreferences({ contentsScroll: 'instant' });

    vi.resetModules();
    preferences = await openApp();
    expect(preferences.getPreferences().contentsScroll).toBe('instant');
  });

  it('hides the page bar while typing by default, and remembers turning that off', async () => {
    let preferences = await openApp();
    expect(preferences.getPreferences().hideHeaderWhileTyping).toBe(true);
    preferences.updatePreferences({ hideHeaderWhileTyping: false });

    vi.resetModules();
    preferences = await openApp();
    expect(preferences.getPreferences().hideHeaderWhileTyping).toBe(false);
  });

  it('remembers the drawing tools, ignoring broken colours and sizes', async () => {
    localStorage.setItem('starjot-preferences-v1', JSON.stringify({ drawing: { tool: 'eraser', pen: { color: 'red', size: 99 }, highlighter: { color: '#30a46c' } } }));
    const preferences = await openApp();
    expect(preferences.getPreferences().drawing).toEqual({
      enabled: true,
      tool: 'eraser',
      pen: { color: 'ink', size: 48 },
      highlighter: { color: '#30a46c', size: 18 },
      selectEdge: 'whole',
      snap: true,
      anchorWrap: 'wrap'
    });
  });
});


/* =========================
   Start Screen, Spaces and Sidebar
   ========================= */

describe('start screen, spaces and sidebar', () => {
  const save = (saved: object) => localStorage.setItem('starjot-preferences-v1', JSON.stringify(saved));

  it('starts on Starjot Home with both spaces on, and Starred and Recent in the sidebar', async () => {
    const { startScreen, spaces, sidebar } = (await openApp()).getPreferences();
    expect(startScreen).toBe('start');
    expect(spaces).toEqual({ notes: true, boardspace: true });
    expect(sidebar).toEqual({ starred: true, recent: true, categories: false, hiddenCategories: [], folded: [] });
  });

  it('lists notes as rows with their colours by default, and remembers Gallery and colours off', async () => {
    const { notesView, noteColorsInLists } = (await openApp()).getPreferences();
    expect(notesView).toBe('list');
    expect(noteColorsInLists).toBe(true);
    vi.resetModules();
    save({ notesView: 'gallery', noteColorsInLists: false });
    const loaded = (await openApp()).getPreferences();
    expect(loaded.notesView).toBe('gallery');
    expect(loaded.noteColorsInLists).toBe(false);
  });

  it('shows every detail row by default, and remembers rows hidden', async () => {
    const { hiddenDetails } = (await openApp()).getPreferences();
    expect(hiddenDetails).toEqual([]);
    vi.resetModules();

    /* Unknown rows are dropped, and rows keep the order the details show them in. */
    save({ hiddenDetails: ['remarks', 'nonsense', 'created'] });
    const loaded = (await openApp()).getPreferences();
    expect(loaded.hiddenDetails).toEqual(['created', 'remarks']);
  });

  it('opens notes in the current tab by default, with Ctrl + click and the setting choosing a new tab', async () => {
    const app = await openApp();
    expect(app.getPreferences().openNewSubNotes).toBe(true);
    expect(app.opensInNewTab(false)).toBe(false);
    expect(app.opensInNewTab(true)).toBe(true);
    app.updatePreferences({ openNotesIn: 'new-notes' });
    expect(app.opensInNewTab(false)).toBe(false);
    expect(app.opensInNewTab(false, true)).toBe(true);
    expect(app.opensInNewTab(true, true)).toBe(false);
    app.updatePreferences({ openNotesIn: 'always' });
    expect(app.opensInNewTab(false)).toBe(true);
    expect(app.opensInNewTab(true)).toBe(false);
  });

  it('starts new notes continuous and pageless on A4, with drawing turned on', async () => {
    const { newNotes, drawing } = (await openApp()).getPreferences();
    expect(newNotes).toEqual({ mode: 'continuous', layout: 'pageless', pageSize: 'a4' });
    expect(drawing.enabled).toBe(true);
    vi.resetModules();
    save({ newNotes: { mode: 'blocks', layout: 'sideways' }, drawing: { enabled: false } });
    const loaded = (await openApp()).getPreferences();
    expect(loaded.newNotes).toEqual({ mode: 'blocks', layout: 'pageless', pageSize: 'a4' });
    expect(loaded.drawing.enabled).toBe(false);
  });

  it('remembers the choices, and never loads with every space off', async () => {
    save({ startScreen: 'boardspace', spaces: { notes: false, boardspace: true }, sidebar: { recent: false, categories: true, hiddenCategories: ['work', 7], folded: ['sidebar-recent', 3] } });
    const loaded = (await openApp()).getPreferences();
    expect(loaded.startScreen).toBe('boardspace');
    expect(loaded.spaces).toEqual({ notes: false, boardspace: true });
    expect(loaded.sidebar).toEqual({ starred: true, recent: false, categories: true, hiddenCategories: ['work'], folded: ['sidebar-recent'] });

    vi.resetModules();
    save({ startScreen: 'garden', spaces: { notes: false, boardspace: false } });
    const repaired = (await openApp()).getPreferences();
    expect(repaired.startScreen).toBe('start');
    expect(repaired.spaces).toEqual({ notes: true, boardspace: true });
  });
});


/* =========================
   Theme, Tips and Writing
   ========================= */

describe('theme, tips and writing', () => {
  it('starts with tips, spellcheck and typing shortcuts on, and marks tips on <html>', async () => {
    const preferences = await openApp();
    const { tips, spellcheck, typingShortcuts } = preferences.getPreferences();
    expect([tips, spellcheck, typingShortcuts]).toEqual([true, true, true]);
    preferences.updatePreferences({ tips: false });
    expect(document.documentElement.dataset.tips).toBe('off');
  });

  it('follows the computer for System, and shows light where it cannot tell', async () => {
    localStorage.setItem('starjot-preferences-v1', JSON.stringify({ theme: 'system' }));
    const preferences = await openApp();
    expect(preferences.getPreferences().theme).toBe('system');
    expect(preferences.shownTheme()).toBe('light');
    preferences.applyTheme();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
