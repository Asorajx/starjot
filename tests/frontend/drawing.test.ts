import { describe, expect, it } from 'vitest';
import { drawingBottom, hexToHsv, hsvToHex, normalizeDrawing, simplifyPoints, strokePath, touchesStroke } from '../../src/frontend/notespace/editor/drawing';
import type { DrawingStroke } from '../../src/shared/types/note';

const line: DrawingStroke = { tool: 'pen', color: 'ink', size: 4, points: [0, 0, 100, 0] };


/* =========================
   Checking Saved Drawings
   ========================= */

describe('normalizeDrawing', () => {
  it('returns a valid drawing as the same array, so changes can be told apart', () => {
    const drawing = [line, { ...line, tool: 'highlighter' as const, color: '#ffd84d' }];
    expect(normalizeDrawing(drawing)).toBe(drawing);
  });

  it('repairs broken strokes and drops strokes without points', () => {
    expect(normalizeDrawing([
      { tool: 'marker', color: 'url(javascript:alert(1))', size: 500, points: [1.234, 2, 3, 'x', 4] },
      { tool: 'pen', color: 'ink', size: 2, points: [] },
      null
    ])).toEqual([{ tool: 'pen', color: 'ink', size: 48, points: [1.2, 2, 3, 4] }]);
  });

  it('gives an empty drawing for anything that is not a list', () => {
    expect(normalizeDrawing(undefined)).toEqual([]);
    expect(normalizeDrawing('strokes')).toEqual([]);
  });
});


/* =========================
   Smoothing and Shapes
   ========================= */

describe('simplifyPoints', () => {
  it('leaves out points that barely change the line, keeping its ends and corners', () => {
    expect(simplifyPoints([0, 0, 10, 0.1, 20, 0, 30, 0.2, 40, 0])).toEqual([0, 0, 40, 0]);
    expect(simplifyPoints([0, 0, 10, 10, 20, 0])).toEqual([0, 0, 10, 10, 20, 0]);
  });

  it('rounds points to one decimal place', () => {
    expect(simplifyPoints([1.234, 5.678])).toEqual([1.2, 5.7]);
  });
});

describe('strokePath', () => {
  it('draws a single point as a dot and longer lines through the middle of each pair', () => {
    expect(strokePath([5, 5])).toBe('M5 5l0.01 0');
    expect(strokePath([0, 0, 10, 0])).toBe('M0 0L10 0');
    expect(strokePath([0, 0, 10, 10, 20, 0])).toBe('M0 0Q10 10 15 5L20 0');
  });
});

describe('touchesStroke', () => {
  it('finds strokes within the eraser and half the stroke width', () => {
    expect(touchesStroke(line, 50, 9, 8)).toBe(true);
    expect(touchesStroke(line, 50, 11, 8)).toBe(false);
    expect(touchesStroke(line, 111, 0, 8)).toBe(false);
  });
});

describe('drawingBottom', () => {
  it('measures the lowest point of the drawing, including the stroke width', () => {
    expect(drawingBottom([line, { ...line, points: [0, 40, 5, 80.2] }])).toBe(83);
    expect(drawingBottom([])).toBe(0);
  });
});

describe('colour wheel colours', () => {
  it('turns hex colours into hue, saturation and brightness and back', () => {
    expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 });
    expect(hexToHsv('#00ff00')).toEqual({ h: 120, s: 1, v: 1 });
    expect(hexToHsv('#ffffff')).toEqual({ h: 0, s: 0, v: 1 });
    for (const hex of ['#3e7bfa', '#e5484d', '#30a46c', '#000000', '#8b95a5']) expect(hsvToHex(hexToHsv(hex))).toBe(hex);
  });
});
