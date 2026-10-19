import type { BoardProject } from '../../../shared/types/board';
import { addDays, addMonths, daysBetween, isoDay, parseDay, shortDay, today, weekStart } from '../dates';


/* =========================
   Timeline Scale
   ========================= */

/* Day, Week or Month: how wide a day is, and how far a dragged bar snaps (a day, a week or a */
/* calendar month at a time). */
export type Zoom = 'day' | 'week' | 'month';

export const ZOOMS: { value: Zoom; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' }
];

const DAY_WIDTH: Record<Zoom, number> = { day: 42, week: 22, month: 7.5 };

/* The days the timeline covers and how wide it is. */
export type Scale = { start: Date; end: Date; span: number; dayWidth: number; width: number; zoom: Zoom };

/* The timeline starts two weeks before the earliest date (today, a sprint or an item) and ends */
/* about four weeks after the latest, always on whole weeks, and shows at least seven weeks from */
/* today. */
export function timelineScale(project: BoardProject, zoom: Zoom, now = today()): Scale {
  const dates = [now, ...project.sprints.flatMap(sprint => [sprint.start, sprint.end]), ...project.items.flatMap(item => [item.start, item.end])]
    .map(day => parseDay(day) as Date)
    .sort((a, b) => a.getTime() - b.getTime());
  const start = weekStart(addDays(dates[0], -14));
  let end = addDays(weekStart(addDays(dates[dates.length - 1], 27)), 6);
  const shortest = addDays(weekStart(parseDay(now) as Date), 48);
  if (end < shortest) end = shortest;
  const span = daysBetween(start, end) + 1;
  const dayWidth = DAY_WIDTH[zoom];
  return { start, end, span, dayWidth, width: Math.round(span * dayWidth), zoom };
}

/* Where a day starts on the timeline, and how wide a bar from start to end (both included) is. */
export function xOf(scale: Scale, day: string) {
  return daysBetween(scale.start, parseDay(day) as Date) * scale.dayWidth;
}

export function widthOf(scale: Scale, start: string, end: string) {
  return Math.max(scale.dayWidth, (daysBetween(parseDay(start) as Date, parseDay(end) as Date) + 1) * scale.dayWidth);
}

/* The month names along the top. */
export function monthBands(scale: Scale) {
  const bands: { key: string; label: string; left: number; width: number }[] = [];
  for (let month = new Date(scale.start.getFullYear(), scale.start.getMonth(), 1); month <= scale.end; month = new Date(month.getFullYear(), month.getMonth() + 1, 1)) {
    const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    const from = Math.max(0, daysBetween(scale.start, month));
    const to = Math.min(scale.span, daysBetween(scale.start, next));
    if (to > from) {
      bands.push({
        key: isoDay(month),
        label: month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        left: from * scale.dayWidth,
        width: (to - from) * scale.dayWidth
      });
    }
  }
  return bands;
}

/* The day marks under the months: every day, every week, or every two weeks. The one holding */
/* today is marked. */
export function dayTicks(scale: Scale, now = today()) {
  const step = scale.zoom === 'day' ? 1 : scale.zoom === 'week' ? 7 : 14;
  const current = parseDay(now) as Date;
  const ticks: { key: string; label: string; left: number; width: number; current: boolean }[] = [];
  for (let index = 0; index < scale.span; index += step) {
    const day = addDays(scale.start, index);
    const offset = daysBetween(day, current);
    ticks.push({
      key: isoDay(day),
      label: scale.zoom === 'day' ? String(day.getDate()) : shortDay(day),
      left: index * scale.dayWidth,
      width: Math.min(step, scale.span - index) * scale.dayWidth,
      current: offset >= 0 && offset < step
    });
  }
  return ticks;
}


/* =========================
   Dragging Bars
   ========================= */

export type DragMode = 'move' | 'start' | 'end';

/* A day moved by a drag of dx pixels, snapped to the scale. */
function shiftDay(day: string, dx: number, scale: Scale) {
  if (scale.zoom === 'month') return addMonths(day, Math.round(dx / (scale.dayWidth * 30.4375)));
  const days = scale.zoom === 'week' ? Math.round(dx / (scale.dayWidth * 7)) * 7 : Math.round(dx / scale.dayWidth);
  return isoDay(addDays(parseDay(day) as Date, days));
}

/* The dates after dragging a bar's middle (both move) or one of its ends (that end moves, and */
/* never past the other). */
export function draggedDates(mode: DragMode, start: string, end: string, dx: number, scale: Scale) {
  if (mode === 'move') return { start: shiftDay(start, dx, scale), end: shiftDay(end, dx, scale) };
  if (mode === 'start') {
    const moved = shiftDay(start, dx, scale);
    return { start: moved > end ? end : moved, end };
  }
  const moved = shiftDay(end, dx, scale);
  return { start, end: moved < start ? start : moved };
}
