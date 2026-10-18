import { describe, expect, it } from 'vitest';
import { clampZoom, fitView, MAX_ZOOM, MIN_ZOOM, zoomAround } from '../../../../src/frontend/notespace/canvas/view';


/* =========================
   Canvas View
   ========================= */

describe('canvas view', () => {
  it('keeps the zoom between its limits', () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(50)).toBe(MAX_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(1.5)).toBe(1.5);
  });

  it('zooms around a point, which stays in the same place on screen', () => {
    const view = { x: 40, y: 60, zoom: 1 };
    const next = zoomAround(view, 2, 240, 160);
    expect(next.zoom).toBe(2);

    /* The canvas point under 240, 160 before (200, 100) is still under it after. */
    expect(next.x + 200 * next.zoom).toBeCloseTo(240);
    expect(next.y + 100 * next.zoom).toBeCloseTo(160);
  });

  it('fits a drawing in the middle of the view, never zoomed past 100%', () => {
    const small = fitView({ x: 0, y: 0, width: 100, height: 50 }, 800, 600);
    expect(small).toEqual({ x: 350, y: 275, zoom: 1 });

    const large = fitView({ x: -1000, y: 0, width: 2000, height: 500 }, 800, 600);
    expect(large.zoom).toBeCloseTo(704 / 2000);
    expect(large.x + 0 * large.zoom).toBeCloseTo(400);
    expect(large.y + 250 * large.zoom).toBeCloseTo(300);
  });
});
