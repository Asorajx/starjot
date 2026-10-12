import { describe, expect, it } from 'vitest';
import {
  connectedStrokes, decodeStrokes, defaultLayers, drawingBottom, encodeStrokes, normalizeLayers, strokeLayer, strokesTouch, hexToHsv, hsvToHex, joinBoxes, mostlyInside, moveStrokes, normalizeDrawing, simplifyPoints, splitStroke,
  strokePath, strokesBounds, touchesStroke
} from '../../src/frontend/notespace/editor/drawing';
import { anchorAlign, takeStrokes } from '../../src/frontend/notespace/editor/anchoring';
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


/* =========================
   Selecting and Pinning
   ========================= */

const box = { x: 0, y: -10, width: 60, height: 20 };

describe('mostlyInside', () => {
  it('takes a stroke when most of its length is inside the box', () => {
    expect(mostlyInside(line, box)).toBe(true);
    expect(mostlyInside(line, { ...box, width: 40 })).toBe(false);
    expect(mostlyInside({ ...line, points: [5, 0] }, box)).toBe(true);
  });
});

describe('splitStroke', () => {
  it('cuts a stroke at the box edge into the parts inside and outside', () => {
    expect(splitStroke(line, box)).toEqual({
      inside: [{ ...line, points: [0, 0, 60, 0] }],
      outside: [{ ...line, points: [60, 0, 100, 0] }]
    });
  });

  it('gives several pieces for a stroke that leaves the box and comes back', () => {
    const zigzag = { ...line, points: [10, 0, 10, 30, 20, 30, 20, 0] };
    const parts = splitStroke(zigzag, box);
    expect(parts.inside.map(stroke => stroke.points)).toEqual([[10, 0, 10, 10], [20, 10, 20, 0]]);
    expect(parts.outside.map(stroke => stroke.points)).toEqual([[10, 10, 10, 30, 20, 30, 20, 10]]);
  });
});

describe('boxes and moving strokes', () => {
  it('measures strokes with their width and joins boxes', () => {
    expect(strokesBounds([line])).toEqual({ x: -2, y: -2, width: 104, height: 4 });
    expect(strokesBounds([])).toBeNull();
    expect(joinBoxes(box, { x: 50, y: 0, width: 20, height: 30 })).toEqual({ x: 0, y: -10, width: 70, height: 40 });
  });

  it('moves and scales strokes, widths included', () => {
    expect(moveStrokes([line], 5, 10, 2)).toEqual([{ ...line, size: 8, points: [5, 10, 205, 10] }]);
  });
});

describe('takeStrokes', () => {
  const far = { ...line, points: [300, 300, 310, 310] };

  it('takes whole strokes mostly inside, growing the box to fit them', () => {
    const result = takeStrokes([line, far], { x: -10, y: -10, width: 80, height: 20 }, 'whole');
    expect(result.taken).toEqual([line]);
    expect(result.left).toEqual([far]);
    expect(result.box).toEqual({ x: -10, y: -10, width: 112, height: 20 });
  });

  it('cuts strokes at the edge, leaving the outside parts behind', () => {
    const result = takeStrokes([line, far], box, 'cut');
    expect(result.taken).toEqual([{ ...line, points: [0, 0, 60, 0] }]);
    expect(result.left).toEqual([{ ...line, points: [60, 0, 100, 0] }, far]);
    expect(result.box).toBe(box);
  });
});

describe('anchorAlign', () => {
  it('puts a drawing on the side its box is nearest, or on its own line', () => {
    expect(anchorAlign({ x: 0, y: 0, width: 100, height: 50 }, 600)).toBe('wrap-left');
    expect(anchorAlign({ x: 480, y: 0, width: 100, height: 50 }, 600)).toBe('right');
    expect(anchorAlign({ x: 250, y: 0, width: 100, height: 50 }, 600)).toBe('center');
    expect(anchorAlign({ x: 0, y: 0, width: 400, height: 50 }, 600)).toBe('center');
  });

  it('uses the nearer side when snapping is off, so the exact place can be kept', () => {
    expect(anchorAlign({ x: 200, y: 0, width: 100, height: 50 }, 600, false)).toBe('wrap-left');
    expect(anchorAlign({ x: 320, y: 0, width: 100, height: 50 }, 600, false)).toBe('right');
  });
});

describe('encodeStrokes', () => {
  it('writes strokes as short text and reads them back', () => {
    const strokes = [line, { tool: 'highlighter' as const, color: '#ffd84d', size: 18, points: [1.25, 2] }];
    const text = encodeStrokes(strokes);
    expect(text).toBe('p,ink,4:0 0 100 0;h,#ffd84d,18:1.3 2');
    expect(decodeStrokes(text)).toEqual([line, { ...strokes[1], points: [1.3, 2] }]);
  });
});


/* =========================
   Layers
   ========================= */

describe('normalizeLayers', () => {
  it('starts with one drawing layer above the text', () => {
    expect(normalizeLayers(undefined)).toEqual(defaultLayers());
    expect(defaultLayers().map(layer => layer.id)).toEqual(['text', 'layer-1']);
  });

  it('returns a valid list as the same array', () => {
    const layers = [{ id: 'layer-2', name: 'Sketch', hidden: true }, ...defaultLayers()];
    expect(normalizeLayers(layers)).toBe(layers);
  });

  it('repairs broken lists: bad ids, repeats, a missing text entry or no drawing layer', () => {
    expect(normalizeLayers([{ id: 'Bad Id!', name: 'x' }, { id: 'layer-2', name: '  ', hidden: 'yes' }, { id: 'layer-2', name: 'Again' }]))
      .toEqual([{ id: 'text', name: 'Text', hidden: false }, { id: 'layer-2', name: 'Layer', hidden: false }]);
    expect(normalizeLayers([{ id: 'text', name: 'Words', hidden: true }])).toEqual(defaultLayers());
  });
});

describe('strokeLayer', () => {
  const layers = [{ id: 'layer-2', name: 'Under', hidden: false }, ...defaultLayers()];

  it('uses the stroke layer, or the first layer for strokes drawn before layers', () => {
    expect(strokeLayer({ ...line, layer: 'layer-2' }, layers)).toBe('layer-2');
    expect(strokeLayer(line, layers)).toBe('layer-1');
    expect(strokeLayer({ ...line, layer: 'gone' }, layers)).toBe('layer-1');
  });

  it('falls back to the first layer above the text when the first layer was removed', () => {
    const others = [{ id: 'text', name: 'Text', hidden: false }, { id: 'layer-3', name: 'Top', hidden: false }];
    expect(strokeLayer(line, others)).toBe('layer-3');
  });

  it('keeps valid layer ids on strokes and drops broken ones', () => {
    expect(normalizeDrawing([{ ...line, layer: 'layer-2' }])[0].layer).toBe('layer-2');
    expect(normalizeDrawing([{ ...line, layer: 'NOT valid' }])[0].layer).toBeUndefined();
  });
});

describe('takeStrokes on one layer', () => {
  it('only takes strokes the filter allows', () => {
    const other = { ...line, layer: 'layer-2' };
    const result = takeStrokes([line, other], { x: -10, y: -10, width: 120, height: 20 }, 'whole', stroke => stroke.layer !== 'layer-2');
    expect(result.taken).toEqual([line]);
    expect(result.left).toEqual([other]);
  });
});


/* =========================
   Strokes That Touch
   ========================= */

describe('connectedStrokes', () => {
  const stroke = (points: number[]) => ({ tool: 'pen' as const, color: 'ink', size: 2, points });

  it('finds strokes that cross or touch, and anything joined to them through others', () => {
    const across = stroke([0, 0, 100, 100]);
    const back = stroke([100, 0, 0, 100]);
    const tail = stroke([100, 100, 140, 100]);
    const apart = stroke([300, 300, 320, 300]);
    expect(strokesTouch(across, back)).toBe(true);
    expect(strokesTouch(across, apart)).toBe(false);
    expect(connectedStrokes([across, apart, back, tail], 2)).toEqual([0, 2, 3]);
  });

  it('leaves out strokes the filter does not allow', () => {
    const strokes = [stroke([0, 0, 10, 0]), { ...stroke([10, 0, 20, 0]), layer: 'other' }];
    expect(connectedStrokes(strokes, 0, item => item.layer !== 'other')).toEqual([0]);
  });
});
