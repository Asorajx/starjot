/* =========================
   Calendar Days
   ========================= */

/* Work is planned in whole days, written as YYYY-MM-DD and read as local dates, so a day never */
/* shifts with the time zone. */
const DAY_MS = 86400000;

const two = (value: number) => String(value).padStart(2, '0');

export function isoDay(date: Date) {
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/* The date of a YYYY-MM-DD day, or null for anything else (including days that do not exist). */
export function parseDay(value: string | null | undefined) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return null;
  const [year, month, day] = (value as string).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function addDays(date: Date, count: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);
}

/* Whole days from a to b (negative when b is earlier). */
export function daysBetween(a: Date, b: Date) {
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY_MS);
}

/* The Monday of the week a date is in. */
export function weekStart(date: Date) {
  return addDays(date, -((date.getDay() + 6) % 7));
}

export function today() {
  return isoDay(new Date());
}

/* The same day of the month a number of months later (or the month's last day, when shorter). */
export function addMonths(value: string, count: number) {
  const source = parseDay(value) as Date;
  const first = new Date(source.getFullYear(), source.getMonth() + count, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  first.setDate(Math.min(source.getDate(), last));
  return isoDay(first);
}

/* "3 Mar" and "3 Mar – 9 Mar". */
export function shortDay(value: string | Date) {
  const date = typeof value === 'string' ? parseDay(value) : value;
  return date ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
}

export function dayRange(start: string, end: string) {
  return `${shortDay(start)} – ${shortDay(end)}`;
}
