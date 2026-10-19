import { iconMarkup } from '../components/Icon';
import { escapeHtml } from '../lib/html';
import type { Note } from '../../shared/types/note';


/* =========================
   Reminders in the Text
   ========================= */

/* A reminder sits in a note's text, added with / → Reminder: */
/* <span class="reminder-chip" data-reminder="r…" data-at="(ISO time)"></span>. It is stored */
/* empty and drawn when shown ("@Tomorrow 9:00 AM" and an alarm clock), like a page mention. At */
/* its time, while Starjot is open, it becomes a notification in the inbox and a toast (a browser */
/* tab cannot wake itself, so one due while Starjot was closed arrives when it opens next). */
export type Reminder = {
  noteId: string;
  id: string;
  at: string;

  /* The words of the line it sits in, to say what it is about. */
  context: string;
};

export function createReminderChip(at: Date) {
  const chip = document.createElement('span');
  chip.className = 'reminder-chip';
  chip.dataset.reminder = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  chip.dataset.at = at.toISOString();
  return chip;
}

function startOfDay(date: Date, addDays = 0) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + addDays);
}

function timeOf(date: Date) {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/* A reminder's time as written in the text: "Today 3:00 PM", "Tomorrow 9:00 AM", "Yesterday */
/* 9:00 AM" or "Oct 25 9:00 AM" (with the year when it is not this year). */
export function reminderLabel(at: string, now: Date) {
  const date = new Date(at);
  const day = startOfDay(date).getTime();
  if (day === startOfDay(now).getTime()) return `Today ${timeOf(date)}`;
  if (day === startOfDay(now, 1).getTime()) return `Tomorrow ${timeOf(date)}`;
  if (day === startOfDay(now, -1).getTime()) return `Yesterday ${timeOf(date)}`;
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric';
  return `${date.toLocaleDateString(undefined, options)} ${timeOf(date)}`;
}

/* The full date and time, for the hover label and for exports: "October 19, 2026 9:00 AM". */
export function fullReminderLabel(at: string) {
  const date = new Date(at);
  return `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })} ${timeOf(date)}`;
}

/* A reminder as words, for exports and copying: "@October 19, 2026 9:00 AM". */
export function reminderText(chip: HTMLElement) {
  return `@${fullReminderLabel(chip.dataset.at ?? '')}`;
}

export function isDue(reminder: Reminder, now: Date) {
  return Date.parse(reminder.at) <= now.getTime();
}

/* Draw reminder chips: "@" and the time with an alarm clock, and the full date when hovered. */
/* One whose time has passed is marked. */
export function hydrateReminders(root: Element | null, now = new Date()) {
  root?.querySelectorAll<HTMLElement>('.reminder-chip').forEach(chip => {
    const at = chip.dataset.at ?? '';
    chip.setAttribute('contenteditable', 'false');
    chip.title = fullReminderLabel(at);
    chip.classList.toggle('is-due', Date.parse(at) <= now.getTime());
    const html = `@${escapeHtml(reminderLabel(at, now))}${iconMarkup('alarm-clock', 14)}`;
    if (chip.innerHTML !== html) chip.innerHTML = html;
  });
}


/* =========================
   Finding and Changing Reminders
   ========================= */

/* The lines a reminder's words are read from. */
const LINES = 'p, h1, h2, h3, h4, h5, h6, li, td, th, .toggle-summary';

/* The reminders in a note's text, in order (kept until its content changes). */
const found = new WeakMap<Note, Reminder[]>();

export function remindersIn(note: Note) {
  const known = found.get(note);
  if (known) return known;
  const template = document.createElement('template');
  template.innerHTML = note.content;
  const reminders = Array.from(template.content.querySelectorAll<HTMLElement>('.reminder-chip')).map(chip => ({
    noteId: note.id,
    id: chip.dataset.reminder ?? '',
    at: chip.dataset.at ?? '',
    context: chip.closest(LINES)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }));
  found.set(note, reminders);
  return reminders;
}

/* Reminders across notes: due already, later today and after today, soonest first. */
export function reminderGroups(notes: Note[], now: Date) {
  const open = notes.flatMap(remindersIn).sort((a, b) => a.at.localeCompare(b.at));
  const tomorrow = startOfDay(now, 1).getTime();
  return {
    due: open.filter(reminder => isDue(reminder, now)),
    today: open.filter(reminder => !isDue(reminder, now) && Date.parse(reminder.at) < tomorrow),
    later: open.filter(reminder => Date.parse(reminder.at) >= tomorrow)
  };
}


/* =========================
   Choosing Times
   ========================= */

/* The quick choices when adding a reminder: later today (5:00 PM, or in an hour after that), */
/* tomorrow and next Monday, at 9:00 AM. */
export function reminderChoices(now: Date) {
  const evening = new Date(startOfDay(now).getTime());
  evening.setHours(17);
  const later = now < evening ? evening : new Date(Math.ceil((now.getTime() + 60 * 60000) / 900000) * 900000);
  const tomorrow = startOfDay(now, 1);
  tomorrow.setHours(9);
  const monday = startOfDay(now, ((8 - now.getDay()) % 7) || 7);
  monday.setHours(9);
  return [
    { label: 'Later today', at: later },
    { label: 'Tomorrow', at: tomorrow },
    { label: 'Next Monday', at: monday }
  ];
}
