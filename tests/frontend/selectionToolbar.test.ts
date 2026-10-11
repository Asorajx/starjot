import { describe, expect, it } from 'vitest';
import { placeToolbar } from '../../src/frontend/notespace/editor/SelectionToolbar';

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
