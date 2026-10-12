import type { DrawingLayerInfo, DrawingStroke, DrawingTool } from '../../../../shared/types/note';

/* The colour of the note's text, which follows light and dark mode. */
export const INK = 'ink';
export const HEX_COLOR = /^#[0-9a-f]{6}$/i;
export const SIZE_MIN = 1;
export const SIZE_MAX = 48;

/* Limits that keep a note's drawing small enough for browser storage. */
const MAX_STROKES = 5000;
const MAX_VALUES = 20000;
const TOOLS: DrawingTool[] = ['pen', 'highlighter'];

/* Layer ids look like layer-1 or layer-lq2x9k; "text" marks the note's text among the layers. */
export const TEXT_LAYER = 'text';
const LAYER_ID = /^[a-z0-9-]{1,24}$/;
export const MAX_LAYERS = 10;
const LAYER_NAME_LENGTH = 30;


/* =========================
   Checking Saved Drawings
   ========================= */

function isStroke(value: unknown): value is DrawingStroke {
  const stroke = value as DrawingStroke;
  return Boolean(stroke) && typeof stroke === 'object'
    && TOOLS.includes(stroke.tool)
    && (stroke.color === INK || HEX_COLOR.test(String(stroke.color)))
    && typeof stroke.size === 'number' && stroke.size >= SIZE_MIN && stroke.size <= SIZE_MAX
    && Array.isArray(stroke.points) && stroke.points.length >= 2 && stroke.points.length % 2 === 0
    && stroke.points.length <= MAX_VALUES && stroke.points.every(Number.isFinite)
    && (stroke.layer === undefined || (typeof stroke.layer === 'string' && LAYER_ID.test(stroke.layer)));
}

/* A stroke with missing or broken parts is repaired, or dropped when it has no points. */
function repairStroke(value: unknown): DrawingStroke[] {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const numbers = Array.isArray(record.points) ? record.points.filter(Number.isFinite) as number[] : [];
  const points = numbers.slice(0, Math.min(MAX_VALUES, numbers.length - (numbers.length % 2))).map(round);
  if (points.length < 2) return [];
  const color = String(record.color ?? '');
  const layer = typeof record.layer === 'string' && LAYER_ID.test(record.layer) ? record.layer : undefined;
  return [{
    tool: TOOLS.includes(record.tool as DrawingTool) ? record.tool as DrawingTool : 'pen',
    color: color === INK || HEX_COLOR.test(color) ? color : INK,
    size: clampSize(Number(record.size)),
    points,
    ...(layer ? { layer } : {})
  }];
}

/* A drawing that is already valid is returned as it is (the same array), so undo history and */
/* other panes can tell whether it changed by comparing arrays. */
export function normalizeDrawing(raw: unknown): DrawingStroke[] {
  if (!Array.isArray(raw)) return [];
  if (raw.length <= MAX_STROKES && raw.every(isStroke)) return raw;
  return raw.slice(0, MAX_STROKES).flatMap(repairStroke);
}

/* A note starts with one drawing layer, above its text. */
export function defaultLayers(): DrawingLayerInfo[] {
  return [{ id: TEXT_LAYER, name: 'Text', hidden: false }, { id: 'layer-1', name: 'Layer 1', hidden: false }];
}

function isLayerList(value: unknown): value is DrawingLayerInfo[] {
  if (!Array.isArray(value) || value.length > MAX_LAYERS + 1) return false;
  const ids = new Set<string>();
  const fine = value.every(layer => layer && typeof layer === 'object'
    && typeof layer.id === 'string' && LAYER_ID.test(layer.id) && !ids.has(layer.id) && ids.add(layer.id)
    && typeof layer.name === 'string' && layer.name.length <= LAYER_NAME_LENGTH && typeof layer.hidden === 'boolean');
  return fine && ids.has(TEXT_LAYER) && ids.size >= 2;
}

/* A drawing's layers: one text entry and at least one drawing layer. A valid list is returned as */
/* it is (the same array), like normalizeDrawing; a broken one is repaired. */
export function normalizeLayers(raw: unknown): DrawingLayerInfo[] {
  if (isLayerList(raw)) return raw;
  if (!Array.isArray(raw)) return defaultLayers();
  const seen = new Set<string>();
  const layers = raw.flatMap(item => {
    const record = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const id = String(record.id ?? '');
    if (!LAYER_ID.test(id) || seen.has(id)) return [];
    seen.add(id);
    const name = id === TEXT_LAYER ? 'Text' : String(record.name ?? '').trim().slice(0, LAYER_NAME_LENGTH) || 'Layer';
    return [{ id, name, hidden: id !== TEXT_LAYER && record.hidden === true }];
  }).slice(0, MAX_LAYERS + 1);
  if (!seen.has(TEXT_LAYER)) layers.unshift({ id: TEXT_LAYER, name: 'Text', hidden: false });
  if (layers.length < 2) layers.push(defaultLayers()[1]);
  return layers;
}

/* The layer a stroke is shown on: its own, or for strokes drawn before layers existed (or whose */
/* layer is gone) the first layer a note starts with, else the first layer above the text. */
export function strokeLayer(stroke: DrawingStroke, layers: DrawingLayerInfo[]) {
  if (stroke.layer && stroke.layer !== TEXT_LAYER && layers.some(layer => layer.id === stroke.layer)) return stroke.layer;
  const first = defaultLayers()[1].id;
  if (layers.some(layer => layer.id === first)) return first;
  const text = layers.findIndex(layer => layer.id === TEXT_LAYER);
  return (layers.slice(text + 1).find(Boolean) ?? layers.find(layer => layer.id !== TEXT_LAYER))?.id ?? '';
}

export function clampSize(size: number) {
  return Number.isFinite(size) ? Math.round(Math.min(SIZE_MAX, Math.max(SIZE_MIN, size))) : 2;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}


/* =========================
   Smoothing and Shapes
   ========================= */

/* Distance from point p to the line segment a–b. */
function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/* A mouse or pen sends many more points than a line needs. Points that barely change the line's */
/* shape are left out (the Ramer–Douglas–Peucker method), so drawings take less storage. */
export function simplifyPoints(points: number[], tolerance = 0.6) {
  const count = points.length / 2;
  if (count <= 2) return points.map(round);
  const keep = new Array<boolean>(count).fill(false);
  keep[0] = keep[count - 1] = true;
  const ranges: [number, number][] = [[0, count - 1]];
  while (ranges.length) {
    const [first, last] = ranges.pop() as [number, number];
    let farthest = -1;
    let distance = tolerance;
    for (let index = first + 1; index < last; index++) {
      const away = distanceToSegment(points[index * 2], points[index * 2 + 1], points[first * 2], points[first * 2 + 1], points[last * 2], points[last * 2 + 1]);
      if (away > distance) {
        farthest = index;
        distance = away;
      }
    }
    if (farthest < 0) continue;
    keep[farthest] = true;
    ranges.push([first, farthest], [farthest, last]);
  }
  return points.filter((_, index) => keep[Math.floor(index / 2)]).map(round);
}

/* The SVG path of a stroke. Curves pass through the middle of each pair of points, which smooths */
/* out the corners of a hand-drawn line. A single point becomes a dot. */
export function strokePath(points: number[]) {
  if (points.length < 2) return '';
  const [x, y] = points;
  if (points.length === 2) return `M${x} ${y}l0.01 0`;
  let path = `M${x} ${y}`;
  for (let index = 2; index < points.length - 2; index += 2) {
    const midX = round((points[index] + points[index + 2]) / 2);
    const midY = round((points[index + 1] + points[index + 3]) / 2);
    path += `Q${points[index]} ${points[index + 1]} ${midX} ${midY}`;
  }
  return `${path}L${points.at(-2)} ${points.at(-1)}`;
}

/* True when a circle at x, y with the given radius touches the stroke (used by the eraser). */
export function touchesStroke(stroke: DrawingStroke, x: number, y: number, radius: number) {
  const reach = radius + stroke.size / 2;
  const { points } = stroke;
  if (points.length === 2) return Math.hypot(points[0] - x, points[1] - y) <= reach;
  for (let index = 0; index < points.length - 2; index += 2) {
    if (distanceToSegment(x, y, points[index], points[index + 1], points[index + 2], points[index + 3]) <= reach) return true;
  }
  return false;
}

/* The segments of a stroke as [ax, ay, bx, by]; a dot is a segment of no length. */
function segments(points: number[]) {
  if (points.length === 2) return [[points[0], points[1], points[0], points[1]]];
  const result: number[][] = [];
  for (let index = 0; index < points.length - 2; index += 2) result.push(points.slice(index, index + 4));
  return result;
}

/* True when the segments a–b and c–d cross. */
function crosses([ax, ay, bx, by]: number[], [cx, cy, dx, dy]: number[]) {
  const side = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  return side(ax, ay, bx, by, cx, cy) * side(ax, ay, bx, by, dx, dy) < 0 && side(cx, cy, dx, dy, ax, ay) * side(cx, cy, dx, dy, bx, by) < 0;
}

/* True when two strokes touch or cross, counting their widths and a pixel of slack: strokes */
/* that touch are parts of one drawing (the two lines of an X, a circle and its arrow). */
export function strokesTouch(first: DrawingStroke, second: DrawingStroke) {
  const reach = (first.size + second.size) / 2 + 1;
  return segments(first.points).some(one => segments(second.points).some(other => crosses(one, other)
    || distanceToSegment(one[0], one[1], other[0], other[1], other[2], other[3]) <= reach
    || distanceToSegment(one[2], one[3], other[0], other[1], other[2], other[3]) <= reach
    || distanceToSegment(other[0], other[1], one[0], one[1], one[2], one[3]) <= reach
    || distanceToSegment(other[2], other[3], one[0], one[1], one[2], one[3]) <= reach));
}

/* The stroke at the start and every stroke joined to it through strokes that touch, among the */
/* strokes the filter allows. Returns their places in the list. */
export function connectedStrokes(strokes: DrawingStroke[], start: number, allowed: (stroke: DrawingStroke) => boolean = () => true) {
  const found = new Set([start]);
  const waiting = [start];
  while (waiting.length) {
    const current = strokes[waiting.pop() as number];
    strokes.forEach((stroke, index) => {
      if (found.has(index) || !allowed(stroke) || !strokesTouch(current, stroke)) return;
      found.add(index);
      waiting.push(index);
    });
  }
  return [...found].sort((a, b) => a - b);
}

/* Highlighter strokes are drawn under pen strokes, so pen lines stay sharp over a highlight. */
/* Works on strokes, or on anything holding a stroke (strokeOf finds it). */
export function inDrawingOrder<T>(items: T[], strokeOf: (item: T) => DrawingStroke) {
  return [...items.filter(item => strokeOf(item).tool === 'highlighter'), ...items.filter(item => strokeOf(item).tool === 'pen')];
}

/* One stroke as SVG markup. Ink strokes use the given colour (currentColor on the page, so they */
/* follow light and dark mode). The stroke was checked when read, so it holds only numbers and */
/* colours. */
export function strokeMarkup(stroke: DrawingStroke, ink = 'currentColor') {
  const color = stroke.color === INK ? ink : stroke.color;
  const opacity = stroke.tool === 'highlighter' ? ' opacity="0.4"' : '';
  return `<path d="${strokePath(stroke.points)}" stroke="${color}" stroke-width="${stroke.size}"${opacity}/>`;
}

/* The drawing layers on one side of the text (under it, or over it), bottom first, without the */
/* hidden ones. */
export function visibleLayers(layers: DrawingLayerInfo[], below: boolean) {
  const text = layers.findIndex(layer => layer.id === TEXT_LAYER);
  return (below ? layers.slice(0, text) : layers.slice(text + 1)).filter(layer => !layer.hidden);
}

/* How far down the drawing reaches, so the page can grow to show strokes below the text. */
export function drawingBottom(strokes: DrawingStroke[]) {
  let bottom = 0;
  for (const stroke of strokes) {
    for (let index = 1; index < stroke.points.length; index += 2) bottom = Math.max(bottom, stroke.points[index] + stroke.size / 2);
  }
  return Math.ceil(bottom);
}


/* =========================
   Colour Wheel Colours
   ========================= */

/* A colour as hue (0–360, around the wheel), saturation (0–1, from the wheel's centre to its */
/* edge) and brightness (0–1). */
export type Hsv = { h: number; s: number; v: number };

export function hexToHsv(hex: string): Hsv {
  const [r, g, b] = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const range = max - Math.min(r, g, b);
  let h = 0;
  if (range) {
    if (max === r) h = ((g - b) / range + 6) % 6;
    else if (max === g) h = (b - r) / range + 2;
    else h = (r - g) / range + 4;
  }
  return { h: h * 60, s: max ? range / max : 0, v: max };
}

export function hsvToHex({ h, s, v }: Hsv) {
  const channel = (offset: number) => {
    const k = (offset + h / 60) % 6;
    const value = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, '0');
  };
  return `#${channel(5)}${channel(3)}${channel(1)}`;
}


/* =========================
   Selecting Strokes
   ========================= */

/* A rectangle in drawing coordinates. */
export type Box = { x: number; y: number; width: number; height: number };

function inside(box: Box, x: number, y: number) {
  return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
}

/* True when most of the stroke's length lies inside the box (a dot counts when it is inside). */
export function mostlyInside(stroke: DrawingStroke, box: Box) {
  const { points } = stroke;
  if (points.length === 2) return inside(box, points[0], points[1]);
  let total = 0;
  let within = 0;
  for (let index = 0; index < points.length - 2; index += 2) {
    const length = Math.hypot(points[index + 2] - points[index], points[index + 3] - points[index + 1]);
    total += length;
    if (inside(box, (points[index] + points[index + 2]) / 2, (points[index + 1] + points[index + 3]) / 2)) within += length;
  }
  return total ? within / total >= 0.5 : inside(box, points[0], points[1]);
}

/* The part of the segment a–b inside the box, as fractions of its length (Liang–Barsky), or null. */
function clipSegment(box: Box, ax: number, ay: number, bx: number, by: number): [number, number] | null {
  let start = 0;
  let end = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const edges: [number, number][] = [[-dx, ax - box.x], [dx, box.x + box.width - ax], [-dy, ay - box.y], [dy, box.y + box.height - ay]];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) start = Math.max(start, t);
    else end = Math.min(end, t);
    if (start > end) return null;
  }
  return [start, end];
}

/* Cut a stroke at the box's edges into the pieces inside it and the pieces outside it. A stroke */
/* that leaves the box and comes back gives several pieces. */
export function splitStroke(stroke: DrawingStroke, box: Box) {
  const { points } = stroke;
  if (points.length === 2) return inside(box, points[0], points[1]) ? { inside: [stroke], outside: [] } : { inside: [], outside: [stroke] };
  const runs: { inside: boolean; points: number[] }[] = [];

  /* Add a piece of a segment, joining it to the previous piece when that is on the same side. */
  const add = (isInside: boolean, from: number[], to: number[]) => {
    if (from[0] === to[0] && from[1] === to[1]) return;
    const last = runs.at(-1);
    if (last && last.inside === isInside && last.points.at(-2) === from[0] && last.points.at(-1) === from[1]) last.points.push(...to);
    else runs.push({ inside: isInside, points: [...from, ...to] });
  };
  for (let index = 0; index < points.length - 2; index += 2) {
    const [ax, ay, bx, by] = points.slice(index, index + 4);
    const at = (t: number) => [round(ax + (bx - ax) * t), round(ay + (by - ay) * t)];
    const part = clipSegment(box, ax, ay, bx, by);
    if (!part) {
      add(false, [ax, ay], [bx, by]);
      continue;
    }
    const [start, end] = part;
    add(false, [ax, ay], at(start));
    add(true, at(start), at(end));
    add(false, at(end), [bx, by]);
  }
  const pieces = (isInside: boolean) => runs.filter(run => run.inside === isInside).map(run => ({ ...stroke, points: run.points }));
  return { inside: pieces(true), outside: pieces(false) };
}

/* The rectangle around the strokes, including their width. */
export function strokesBounds(strokes: DrawingStroke[]): Box | null {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const stroke of strokes) {
    const half = stroke.size / 2;
    for (let index = 0; index < stroke.points.length; index += 2) {
      left = Math.min(left, stroke.points[index] - half);
      right = Math.max(right, stroke.points[index] + half);
      top = Math.min(top, stroke.points[index + 1] - half);
      bottom = Math.max(bottom, stroke.points[index + 1] + half);
    }
  }
  return left === Infinity ? null : { x: left, y: top, width: right - left, height: bottom - top };
}

/* The smallest box holding both boxes. */
export function joinBoxes(a: Box, b: Box | null): Box {
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

/* Move strokes by dx, dy and scale them (points and widths) by scale, around the point 0, 0. */
export function moveStrokes(strokes: DrawingStroke[], dx: number, dy: number, scale = 1): DrawingStroke[] {
  return strokes.map(stroke => ({
    ...stroke,
    size: clampSize(stroke.size * scale),
    points: stroke.points.map((value, index) => round(value * scale + (index % 2 ? dy : dx)))
  }));
}


/* =========================
   Anchored Drawings
   ========================= */

/* A drawing anchored into the text keeps its strokes in its element as short text: strokes are */
/* separated by ";", and each is "tool,colour,size:x y x y …" (p for pen, h for highlighter), */
/* with points measured from the drawing's top-left corner. */
const TOOL_CODES: Record<DrawingTool, string> = { pen: 'p', highlighter: 'h' };

/* An anchored drawing has no layers, so the strokes' layers are left out. */
export function encodeStrokes(strokes: DrawingStroke[]) {
  return strokes.map(stroke => `${TOOL_CODES[stroke.tool]},${stroke.color},${stroke.size}:${stroke.points.map(round).join(' ')}`).join(';');
}

/* Read strokes back from their text; anything broken is repaired or left out by normalizeDrawing. */
export function decodeStrokes(text: string) {
  const strokes = text.split(';').slice(0, MAX_STROKES).map(part => {
    const [head = '', body = ''] = part.split(':');
    const [tool, color, size] = head.split(',');
    return {
      tool: tool === 'h' ? 'highlighter' : 'pen',
      color,
      size: Number(size),
      points: body.trim().split(/\s+/).filter(Boolean).map(Number)
    };
  });
  return normalizeDrawing(strokes);
}
