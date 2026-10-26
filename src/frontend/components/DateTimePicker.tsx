import { useState, type KeyboardEvent } from 'react';
import { Dropdown } from './Dropdown';
import { Icon } from './Icon';

type DateTimePickerProps = {
  value: Date;
  onChange: (value: Date) => void;

  /* Leave out the time, for choosing a day only. */
  dateOnly?: boolean;
};

/* Times offered, every 15 minutes through the day. */
const TIME_STEP = 15;


/* =========================
   Date and Time Picker
   ========================= */

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/* The days shown for a month: from the Monday on or before the 1st to the Sunday on or after its */
/* last day, so every row is a full week. */
function monthDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - ((first.getDay() + 6) % 7));
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const count = Math.ceil(((last.getTime() - start.getTime()) / 86400000 + 1) / 7) * 7;
  return Array.from({ length: count }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/* A day as text (2026-10-26), to find its button again. */
const dayKey = (day: Date) => `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;

/* "9:15 AM" for minutes after midnight, as the computer writes times. */
function timeLabel(minutes: number) {
  return new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/* A date and time in the app's own style, in place of the browser's: a month calendar (← → ↑ ↓ */
/* move the day, Page Up and Page Down the month) and a time, every 15 minutes (a time between */
/* those, already chosen, is kept in the list). Each change is passed on straight away. The */
/* calendar is a grid of week rows. Tab always reaches one day of the month shown: the chosen */
/* day, or else today, or else the 1st, so another month never leaves no day to reach. */
export function DateTimePicker({ value, onChange, dateOnly = false }: DateTimePickerProps) {
  const [month, setMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const today = new Date();
  const minutes = value.getHours() * 60 + value.getMinutes();
  const steps = Array.from({ length: (24 * 60) / TIME_STEP }, (_, index) => index * TIME_STEP);
  if (!steps.includes(minutes)) steps.push(minutes);
  steps.sort((a, b) => a - b);

  /* Move to a day, keeping the time, and show its month. */
  function pickDay(day: Date) {
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), value.getHours(), value.getMinutes());
    onChange(next);
    setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
  }

  const days = monthDays(month);
  const inMonth = (day: Date) => day.getMonth() === month.getMonth();
  const reachable = days.find(day => sameDay(day, value) && inMonth(day))
    ?? days.find(day => sameDay(day, today) && inMonth(day))
    ?? days.find(inMonth);

  /* The keys move from the day with focus (the one Tab reached), not only from the chosen one. */
  function handleGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const from = days.find(day => dayKey(day) === (event.target as HTMLElement).dataset.day) ?? value;
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => new Date(from.getFullYear(), from.getMonth(), from.getDate() - 1),
      ArrowRight: () => new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1),
      ArrowUp: () => new Date(from.getFullYear(), from.getMonth(), from.getDate() - 7),
      ArrowDown: () => new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7),
      PageUp: () => new Date(from.getFullYear(), from.getMonth() - 1, from.getDate()),
      PageDown: () => new Date(from.getFullYear(), from.getMonth() + 1, from.getDate())
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    event.stopPropagation();
    pickDay(move());

    /* Keep the focus on the chosen day once it is drawn. */
    requestAnimationFrame(() => (event.target as HTMLElement).closest('.date-picker')?.querySelector<HTMLElement>('.date-picker-day.is-chosen')?.focus());
  }

  return (
    <div className="date-picker">
      <div className="date-picker-heading">
        <button type="button" className="date-picker-step" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
          <Icon name="arrow-left" size={14} />
        </button>
        <strong aria-live="polite">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
        <button type="button" className="date-picker-step" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
          <Icon name="arrow-right" size={14} />
        </button>
      </div>
      <div className="date-picker-grid" role="grid" aria-label="Day" onKeyDown={handleGridKeyDown}>
        <div className="date-picker-row" role="row">
          {WEEKDAYS.map(day => <span key={day} className="date-picker-weekday" role="columnheader" aria-label={day}>{day[0]}</span>)}
        </div>
        {Array.from({ length: days.length / 7 }, (_, week) => (
          <div key={week} className="date-picker-row" role="row">
            {days.slice(week * 7, week * 7 + 7).map(day => {
              const chosen = sameDay(day, value);
              return (
                <button
                  key={day.toDateString()}
                  type="button"
                  role="gridcell"
                  data-day={dayKey(day)}
                  aria-selected={chosen}
                  aria-label={day.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  tabIndex={reachable && sameDay(day, reachable) ? 0 : -1}
                  className={`date-picker-day ${chosen ? 'is-chosen' : ''} ${sameDay(day, today) ? 'is-today' : ''} ${inMonth(day) ? '' : 'is-outside'}`}
                  onClick={() => pickDay(day)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {!dateOnly && (
        <div className="date-picker-time">
          <Icon name="clock" size={14} />
          <Dropdown
            label="Time"
            value={String(minutes)}
            options={steps.map(step => ({ value: String(step), label: timeLabel(step) }))}
            onChange={chosen => onChange(new Date(value.getFullYear(), value.getMonth(), value.getDate(), Math.floor(Number(chosen) / 60), Number(chosen) % 60))}
          />
        </div>
      )}
    </div>
  );
}
