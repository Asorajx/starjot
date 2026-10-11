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
