import type { Box } from '../editor/drawing/drawing';


/* =========================
   Canvas View
   ========================= */

/* The part of a canvas in view: where the canvas's starting corner is on screen (in pixels from */
/* the view's top left) and how much it is zoomed. */
export type CanvasView = { x: number; y: number; zoom: number };

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

/* The space kept around a drawing fitted into view, in screen pixels. */
const FIT_MARGIN = 48;

export function clampZoom(zoom: number) {
  return Number.isFinite(zoom) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) : 1;
}

/* Zoom to a new level, keeping the point at x, y (on screen, from the view's top left) still. */
export function zoomAround(view: CanvasView, zoom: number, x: number, y: number): CanvasView {
  const next = clampZoom(zoom);
  const ratio = next / view.zoom;
  return { x: x - (x - view.x) * ratio, y: y - (y - view.y) * ratio, zoom: next };
}

/* The view showing the whole box in the middle of a view of this size, never zoomed past 100%. */
export function fitView(box: Box, width: number, height: number): CanvasView {
  const room = (size: number) => Math.max(1, size - FIT_MARGIN * 2);
  const zoom = clampZoom(Math.min(1, room(width) / Math.max(1, box.width), room(height) / Math.max(1, box.height)));
  return {
    x: width / 2 - (box.x + box.width / 2) * zoom,
    y: height / 2 - (box.y + box.height / 2) * zoom,
    zoom
  };
}
