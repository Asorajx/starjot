import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* The toast store keeps its toasts between calls, so each test imports a fresh copy. */
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
});

async function openStore() {
  const store = await import('../../../src/frontend/lib/toasts');
  return { ...store, shown: () => store.visibleToasts() };
}


/* =========================
   Toasts
   ========================= */

describe('toasts', () => {
  it('close themselves after a while, fading out first, unless told to stay', async () => {
    const store = await openStore();
    store.showToast({ kind: 'info', title: 'Saved' });
    store.showToast({ kind: 'info', title: 'Stays', stay: true });
    expect(store.shown().map(toast => toast.title)).toEqual(['Saved', 'Stays']);
    vi.advanceTimersByTime(5000);
    expect(store.shown()[0].leaving).toBe(true);
    vi.advanceTimersByTime(200);
    expect(store.shown().map(toast => toast.title)).toEqual(['Stays']);
  });

  it('shows the newest three at most, and replaces a toast shown again with the same id', async () => {
    const store = await openStore();
    ['One', 'Two', 'Three', 'Four'].forEach(title => store.showToast({ kind: 'info', title }));
    expect(store.shown().map(toast => toast.title)).toEqual(['Two', 'Three', 'Four']);
    store.showToast({ id: 'save', kind: 'loading', title: 'Saving…' });
    store.showToast({ id: 'save', kind: 'success', title: 'Saved' });
    expect(store.shown().filter(toast => toast.id === 'save').map(toast => toast.title)).toEqual(['Saved']);
  });

  it('turns a loading toast into success or error when the work ends', async () => {
    const store = await openStore();
    await store.toastWhile(Promise.resolve(1), { loading: 'Saving…', success: 'Saved', error: 'Not saved' });
    expect(store.shown().at(-1)).toMatchObject({ kind: 'success', title: 'Saved' });
    await expect(store.toastWhile(Promise.reject(new Error('no')), { loading: 'Saving…', success: 'Saved', error: 'Not saved' })).rejects.toThrow('no');
    expect(store.shown().at(-1)).toMatchObject({ kind: 'error', title: 'Not saved' });
  });
});
