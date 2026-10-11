import { describe, expect, it } from 'vitest';
import { clearPages, pageGeometry, pageStep } from '../../src/frontend/notespace/editor/pagination';


/* =========================
   Page Sizes
   ========================= */

describe('pageGeometry', () => {
  it('gives A4 and Letter pages in CSS pixels with a one-inch margin', () => {
    expect(pageGeometry('a4', false)).toEqual({ width: 794, height: 1123, margin: 96, gap: 24 });
    expect(pageGeometry('letter', false)).toMatchObject({ width: 816, height: 1056 });
  });

  it('turns a landscape page sideways', () => {
    expect(pageGeometry('a4', true)).toMatchObject({ width: 1123, height: 794 });
  });

  it('steps from one page to the next across the gap', () => {
    expect(pageStep(pageGeometry('a4', false))).toBe(1147);
  });
});

describe('clearPages', () => {
  it('also clears a page mark the browser copied onto a new line (Enter in a moved line)', () => {
    const frame = document.createElement('div');
    frame.innerHTML = '<p class="page-pushed" style="--page-push: 200px">Moved</p><p class="page-pushed" style="--page-push: 200px"><br></p>';
    clearPages(frame);
    expect(frame.innerHTML).toBe('<p>Moved</p><p><br></p>');
  });
});
