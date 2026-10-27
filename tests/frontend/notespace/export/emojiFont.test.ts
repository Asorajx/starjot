import { afterEach, describe, expect, it, vi } from 'vitest';
import { withEmojiFont } from '../../../../src/frontend/notespace/export/exportHtml';

const STYLES = '<style>@font-face { font-family: "Starjot Emoji"; src: url("/fonts/Twemoji.Mozilla.ttf") format("truetype"); }</style>';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the emoji font in exported files', () => {
  it('goes inside a file that shows emoji, in place of the app\'s address for it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('font')));
    const file = await withEmojiFont(`<html><head>${STYLES}</head><body><p>Plan 😀</p></body></html>`);
    expect(file).toMatch(/src: url\("data:[^"]+;base64,/);
    expect(file).not.toContain('/fonts/Twemoji.Mozilla.ttf');
  });

  it('leaves a file without emoji (or whose font cannot be read) as it is', async () => {
    const plain = `<html><head>${STYLES}</head><body><p>No emoji → ✓</p></body></html>`;
    const fetch = vi.fn(async () => new Response(''));
    vi.stubGlobal('fetch', fetch);
    expect(await withEmojiFont(plain)).toBe(plain);
    expect(fetch).not.toHaveBeenCalled();

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));
    const flag = plain.replace('No emoji', '🇸🇬');
    expect(await withEmojiFont(flag)).toBe(flag);
  });
});
