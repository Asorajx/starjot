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

  it('starts in light mode, even when the computer prefers dark mode', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes('dark'), media: query })) as unknown as typeof window.matchMedia;
    const preferences = await openApp();
    expect(preferences.getPreferences().theme).toBe('light');
    window.matchMedia = original;
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
      tool: 'eraser',
      pen: { color: 'ink', size: 48 },
      highlighter: { color: '#30a46c', size: 18 },
      selectEdge: 'whole',
      snap: true,
      anchorWrap: 'wrap'
    });
  });
});
