import type { DrawingStroke, DrawingTool } from '../../../shared/types/note';

/* The colour of the note's text, which follows light and dark mode. */
export const INK = 'ink';
export const HEX_COLOR = /^#[0-9a-f]{6}$/i;
export const SIZE_MIN = 1;
export const SIZE_MAX = 48;

/* Limits that keep a note's drawing small enough for browser storage. */
const MAX_STROKES = 5000;
const MAX_VALUES = 20000;
const TOOLS: DrawingTool[] = ['pen', 'highlighter'];


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
    && stroke.points.length <= MAX_VALUES && stroke.points.every(Number.isFinite);
}

/* A stroke with missing or broken parts is repaired, or dropped when it has no points. */
function repairStroke(value: unknown): DrawingStroke[] {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const numbers = Array.isArray(record.points) ? record.points.filter(Number.isFinite) as number[] : [];
  const points = numbers.slice(0, Math.min(MAX_VALUES, numbers.length - (numbers.length % 2))).map(round);
  if (points.length < 2) return [];
  const color = String(record.color ?? '');
  return [{
    tool: TOOLS.includes(record.tool as DrawingTool) ? record.tool as DrawingTool : 'pen',
    color: color === INK || HEX_COLOR.test(color) ? color : INK,
    size: clampSize(Number(record.size)),
    points
  }];
}

/* A drawing that is already valid is returned as it is (the same array), so undo history and */
/* other panes can tell whether it changed by comparing arrays. */
export function normalizeDrawing(raw: unknown): DrawingStroke[] {
  if (!Array.isArray(raw)) return [];
  if (raw.length <= MAX_STROKES && raw.every(isStroke)) return raw;
  return raw.slice(0, MAX_STROKES).flatMap(repairStroke);
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
