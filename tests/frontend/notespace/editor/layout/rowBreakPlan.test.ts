import { describe, expect, it } from 'vitest';
import { planRowContinuations } from '../../../../../src/frontend/notespace/editor/layout/rowBreakPlan';
import { pageGeometry, pageStep } from '../../../../../src/frontend/notespace/editor/layout/pagination';

const paper = pageGeometry('a4', false);
const step = pageStep(paper);


/* =========================
   Row Break Plan
   ========================= */

describe('planning where a table row breaks across pages', () => {
  it.each(['a4', 'letter'] as const)('keeps every planned line inside %s portrait and landscape pages with repeated headers', size => {
    for (const landscape of [false, true]) {
      const geometry = pageGeometry(size, landscape);
      const lines = Array.from({ length: 300 }, (_, i) => ({ top: 600 + i * 23, bottom: 620 + i * 23 }));
      const breaks = planRowContinuations(lines, geometry, { headerHeight: 42 });
      let shift = 0;
      lines.forEach((line, index) => {
        shift += breaks.find(item => item.beforeLine === index)?.spacerHeight ?? 0;
        const page = Math.floor((line.top + shift) / pageStep(geometry));
        expect(line.top + shift).toBeGreaterThanOrEqual(page * pageStep(geometry) + geometry.margin + (page > 0 ? 42 : 0));
        expect(line.bottom + shift).toBeLessThanOrEqual(page * pageStep(geometry) + geometry.height - geometry.margin + 0.5);
      });
    }
  });

  it('rejects unusable measurements and geometry', () => {
    expect(planRowContinuations([{ top: NaN, bottom: 20 }], paper)).toEqual([]);
    expect(planRowContinuations([{ top: 20, bottom: 20 }], paper)).toEqual([]);
    expect(planRowContinuations([{ top: 20, bottom: 40 }], { ...paper, height: 0, gap: 0 })).toEqual([]);
    expect(planRowContinuations([{ top: 20, bottom: 40 }], paper, { headerHeight: 1000 })).toEqual([]);
  });
  it('keeps lines within a page where they are', () => {
    expect(planRowContinuations([{ top: 300, bottom: 320 }, { top: 320, bottom: 340 }], paper)).toEqual([]);
  });

  it('moves a line crossing the page end to the next page, and the lines after it with it', () => {
    const breaks = planRowContinuations([{ top: 990, bottom: 1020 }, { top: 1020, bottom: 1050 }, { top: 1050, bottom: 1080 }], paper);
    expect(breaks).toEqual([{ beforeLine: 1, spacerHeight: step + 96 - 1020, nextTop: step + 96 }]);
  });

  it('leaves room for the repeated header on the next page', () => {
    expect(planRowContinuations([{ top: 1020, bottom: 1040 }], paper, { headerHeight: 38 })[0].nextTop).toBe(step + 96 + 38);
  });

  it('does not keep header room on the page the table starts on', () => {
    expect(planRowContinuations([{ top: 100, bottom: 120 }], paper, { headerHeight: 38 })).toEqual([]);
  });

  it('moves a line under a later page\'s header copy down below it, on the same page', () => {
    expect(planRowContinuations([{ top: step + 100, bottom: step + 120 }], paper, { headerHeight: 38 })).toEqual([
      { beforeLine: 0, spacerHeight: 34, nextTop: step + 134 }
    ]);
  });

  it('moves a line in a top margin down to that page\'s text, not a page further', () => {
    expect(planRowContinuations([{ top: step + 50, bottom: step + 70 }], paper)).toEqual([
      { beforeLine: 0, spacerHeight: 46, nextTop: step + 96 }
    ]);
  });

  it('breaks again on each page a long cell runs over', () => {
    const lines = Array.from({ length: 100 }, (_, index) => ({ top: 900 + index * 30, bottom: 930 + index * 30 }));
    const breaks = planRowContinuations(lines, paper);
    expect(breaks.length).toBeGreaterThan(1);
    expect(breaks.every(item => item.spacerHeight > 0)).toBe(true);
    expect(breaks[1].beforeLine).toBeGreaterThan(breaks[0].beforeLine);
    breaks.forEach(item => {
      const page = Math.floor(item.nextTop / step);
      expect(item.nextTop - page * step).toBe(96);
    });
  });

  it('leaves a single line taller than a page where it is', () => {
    expect(planRowContinuations([{ top: 200, bottom: 2000 }], paper)).toEqual([]);
  });
});
