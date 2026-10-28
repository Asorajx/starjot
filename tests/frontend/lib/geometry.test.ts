import { describe, expect, it } from 'vitest';
import { edgeScrollStep } from '../../../src/frontend/lib/geometry';


/* =========================
   Edge Scrolling
   ========================= */

describe('scrolling at the edge while dragging', () => {
  it('does not scroll until the pointer nears an edge', () => {
    expect(edgeScrollStep(200, 100, 500, 16)).toBe(0);
    expect(edgeScrollStep(428, 100, 500, 16)).toBe(0);
    expect(edgeScrollStep(172, 100, 500, 16)).toBe(0);
  });

  it('scrolls down near the bottom and up near the top, faster closer to the edge', () => {
    expect(edgeScrollStep(480, 100, 500, 16)).toBeGreaterThan(0);
    expect(edgeScrollStep(495, 100, 500, 16)).toBeGreaterThan(edgeScrollStep(480, 100, 500, 16));
    expect(edgeScrollStep(120, 100, 500, 16)).toBeLessThan(0);
    expect(edgeScrollStep(100, 100, 500, 16)).toBeCloseTo(-15.36);
    expect(edgeScrollStep(500, 100, 500, 16)).toBeCloseTo(15.36);
  });

  it('keeps to full speed past the edge and never jumps after a long gap between frames', () => {
    expect(edgeScrollStep(600, 100, 500, 1000)).toBeCloseTo(30.72);
    expect(edgeScrollStep(0, 100, 500, 1000)).toBeCloseTo(-30.72);
    expect(edgeScrollStep(490, 100, 500, -5)).toBe(0);
    expect(edgeScrollStep(490, 100, 110, 16)).toBe(0);
  });
});
