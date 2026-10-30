import type { PageGeometry } from './pagination';

/* A line of a table cell, in CSS pixels at 100% zoom from the top of the page frame. */
export type TextLine = { top: number; bottom: number };

/* Where a cell's text breaks to the next page: before which line, how much space goes above it, */
/* and where that line then starts. */
export type RowBreak = { beforeLine: number; spacerHeight: number; nextTop: number };

/* The pages a table's rows are on: a repeated header row of this height sits at the top of every */
/* page after the one the table starts on (firstPage). */
export type RowBreakOptions = { headerHeight?: number; firstPage?: number };

/* Where a cell's lines (in order) must break so that each sits within a page's text: a line */
/* crossing the page's end, or in the gap, moves to the next page's text, below its repeated */
/* header; one in a top margin moves down to that page's text. Every later line moves with it. */
/* This only works the breaks out; it changes nothing. A single line taller than a page's text */
/* cannot break and is left where it is. */
export function planRowContinuations(lines: readonly TextLine[], geometry: PageGeometry, options: RowBreakOptions = {}): RowBreak[] {
  const { headerHeight = 0, firstPage = 0 } = options;
  const step = geometry.height + geometry.gap;
  const textTop = (page: number) => page * step + geometry.margin + (page > firstPage ? Math.max(0, headerHeight) : 0);
  const textBottom = (page: number) => page * step + geometry.height - geometry.margin;

  /* The text a continuation page holds, below its repeated header. */
  const room = geometry.height - geometry.margin * 2 - Math.max(0, headerHeight);
  const valid = lines.every(line => Number.isFinite(line.top) && Number.isFinite(line.bottom) && line.bottom > line.top);
  if (!valid || !Number.isFinite(step) || step <= 0 || !Number.isFinite(room) || room <= 0) return [];

  const breaks: RowBreak[] = [];
  let shift = 0;
  lines.forEach((line, index) => {
    const top = line.top + shift;
    const bottom = line.bottom + shift;
    const page = Math.max(0, Math.floor(top / step));
    if (bottom - top > room) return;
    let target = Math.max(top, textTop(page));
    if (target + bottom - top > textBottom(page) + 0.5) target = textTop(page + 1);
    if (target <= top) return;
    shift += target - top;
    breaks.push({ beforeLine: index, spacerHeight: target - top, nextTop: target });
  });
  return breaks;
}
