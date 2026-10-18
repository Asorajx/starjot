import { describe, expect, it } from 'vitest';
import { BOX_WIDTH, boxWidth, isEmptyBox, MAX_BOX_WIDTH, MIN_BOX_WIDTH, newBoxId, readBoxes, removeBox, writeBox, BOX_ID } from '../../../../src/frontend/notespace/canvas/boxes';


/* =========================
   Canvas Text Boxes
   ========================= */

const BOX = '<div class="canvas-box" data-box="b1" data-x="10" data-y="20" data-width="300"><p>One</p></div>';

describe('canvas text boxes', () => {
  it('reads the boxes in a canvas, with their place, width and lines', () => {
    expect(readBoxes(`${BOX}<p>loose</p>`)).toEqual([{ id: 'b1', x: 10, y: 20, width: 300, html: '<p>One</p>' }]);
    expect(readBoxes('')).toEqual([]);
  });

  it('changes a box in place, or adds a new one on top', () => {
    const moved = writeBox(BOX, { id: 'b1', x: 50, y: 60, width: 200 });
    expect(readBoxes(moved)).toEqual([{ id: 'b1', x: 50, y: 60, width: 200, html: '<p>One</p>' }]);

    const added = writeBox(BOX, { id: 'b2', x: 0, y: 0, width: BOX_WIDTH }, '<p>Two</p>');
    expect(readBoxes(added).map(box => [box.id, box.html])).toEqual([['b1', '<p>One</p>'], ['b2', '<p>Two</p>']]);
  });

  it('removes a box', () => {
    expect(readBoxes(removeBox(BOX, 'b1'))).toEqual([]);
  });

  it('counts a box as empty only with no words and nothing else in it', () => {
    expect(isEmptyBox('<p><br></p>')).toBe(true);
    expect(isEmptyBox('<p> </p>')).toBe(true);
    expect(isEmptyBox('<p>Hi</p>')).toBe(false);
    expect(isEmptyBox('<p><span class="page-mention" data-page="atlas"></span></p>')).toBe(false);
    expect(isEmptyBox('<hr>')).toBe(false);
  });

  it('keeps widths within limits and makes valid ids', () => {
    expect(boxWidth(10)).toBe(MIN_BOX_WIDTH);
    expect(boxWidth(99999)).toBe(MAX_BOX_WIDTH);
    expect(boxWidth('nonsense')).toBe(BOX_WIDTH);
    expect(BOX_ID.test(newBoxId())).toBe(true);
  });
});
