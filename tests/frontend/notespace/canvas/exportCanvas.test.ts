import { describe, expect, it } from 'vitest';
import { createNote, getNote, updateNote } from '../../../../src/frontend/notespace/store';
import { canvasBounds, canvasMarkdown, canvasScene, canvasText, readingOrder } from '../../../../src/frontend/notespace/canvas/exportCanvas';
import { readBoxes, writeBox } from '../../../../src/frontend/notespace/canvas/boxes';
import type { Note } from '../../../../src/shared/types/note';


/* =========================
   Canvas Export
   ========================= */

/* A canvas with a stroke and two boxes: the lower one stored first. */
function sampleCanvas() {
  const canvas = createNote('', '', 'canvas');
  let content = writeBox('', { id: 'b2', x: 0, y: 200, width: 300 }, '<p>Second</p>');
  content = writeBox(content, { id: 'b1', x: 40, y: 10, width: 300 }, '<h2>First</h2><ul><li>Item</li></ul>');
  updateNote(canvas.id, { title: 'Board', content, drawing: [{ tool: 'pen', color: 'ink', size: 2, points: [-100, -50, 10, 10] }] });
  return getNote(canvas.id) as Note;
}

describe('canvas export', () => {
  it('orders text boxes top to bottom, then left to right', () => {
    const order = readingOrder([
      { id: 'a', x: 50, y: 10, width: 100, html: '' },
      { id: 'b', x: 0, y: 10, width: 100, html: '' },
      { id: 'c', x: 0, y: 0, width: 100, html: '' }
    ]);
    expect(order.map(box => box.id)).toEqual(['c', 'b', 'a']);
  });

  it('writes the title and each box as Markdown and as plain text, in reading order', () => {
    const canvas = sampleCanvas();
    const boxes = readBoxes(canvas.content);
    expect(canvasMarkdown(canvas, boxes)).toBe('# Board\n\n## First\n\n- Item\n\nSecond\n');
    expect(canvasText(canvas, boxes)).toBe('Board\n=====\n\nFirst\n\n• Item\n\nSecond\n');
  });

  it('crops a picture to everything on the canvas, and has nothing for an empty canvas', () => {
    const canvas = sampleCanvas();
    const placed = [{ x: 40, y: 10, width: 300, height: 100, html: '<p>First</p>' }];
    expect(canvasBounds(canvas, placed)).toEqual({ x: -101, y: -51, width: 441, height: 161 });

    const scene = canvasScene(canvas, placed);
    expect(scene).toMatchObject({ width: 505, height: 225 });
    expect(scene?.html).toContain('left: 173px; top: 93px; width: 300px');
    expect(scene?.html).toContain('stroke="#1c2c47"');

    const empty = createNote('', '', 'canvas');
    expect(canvasScene(empty, [])).toBeNull();
  });
});
