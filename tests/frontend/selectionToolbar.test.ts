import { describe, expect, it } from 'vitest';
import { placeToolbar, selectionKind } from '../../src/frontend/notespace/editor/SelectionToolbar';

const view = { width: 1000, height: 800 };
const size = { width: 280, height: 40 };
const box = (top: number, bottom: number, left = 300, right = 500) => ({ top, bottom, left, right });


/* =========================
   Selection Toolbar Position
   ========================= */

describe('selection toolbar position', () => {
  it('sits above the selection when there is room', () => {
    const selection = box(400, 420);
    expect(placeToolbar({ selection, end: selection }, size, view)).toEqual({ top: 352, left: 400 });
  });

  it('sits below a selection that starts just under the top bar', () => {
    const selection = box(80, 300);
    expect(placeToolbar({ selection, end: selection }, size, view).top).toBe(308);
  });

  it('stays on screen for a selection near the bottom of the window', () => {
    const selection = box(770, 790);
    const { top } = placeToolbar({ selection, end: selection }, size, view);
    expect(top).toBe(722);
    expect(top + size.height).toBeLessThanOrEqual(view.height);
  });

  it('follows the end of a selection that fills the window', () => {
    const selection = box(70, 1400);
    const end = box(600, 620, 150, 150);
    expect(placeToolbar({ selection, end }, size, view)).toEqual({ top: 552, left: 150 });
  });

  it('never goes past the left or right edge', () => {
    expect(placeToolbar({ selection: box(400, 420, 0, 20), end: box(400, 420) }, size, view).left).toBe(148);
    expect(placeToolbar({ selection: box(400, 420, 980, 1000), end: box(400, 420) }, size, view).left).toBe(852);
  });
});


/* =========================
   Kind of Text
   ========================= */

describe('selectionKind', () => {
  function kind(html: string, from: string, to = from) {
    const root = document.createElement('div');
    root.innerHTML = html;
    const range = document.createRange();
    range.selectNodeContents(root.querySelector(from) as Element);
    range.setEnd(root.querySelector(to) as Element, (root.querySelector(to) as Element).childNodes.length);
    return selectionKind(range, root);
  }

  it('names the kind of line selected', () => {
    expect(kind('<p>One</p>', 'p')).toBe('Text');
    expect(kind('<h2>Goals</h2>', 'h2')).toBe('Heading 2');
    expect(kind('<ul><li>a</li></ul>', 'li')).toBe('Bulleted list');
    expect(kind('<ol><li>a</li></ol>', 'li')).toBe('Numbered list');
    expect(kind('<blockquote><p>q</p></blockquote>', 'p')).toBe('Quote');
    expect(kind('<pre><code>x</code></pre>', 'code')).toBe('Code');
    expect(kind('<div class="toggle-block"><h3 class="toggle-summary">T</h3></div>', 'h3')).toBe('Toggle heading 3');
  });

  it('says Mixed when the selection covers lines of different kinds', () => {
    expect(kind('<h1>Title</h1><p>Text</p>', 'h1', 'p')).toBe('Mixed');
    expect(kind('<p>One</p><p>Two</p>', 'p', 'p:last-child')).toBe('Text');
  });
});
