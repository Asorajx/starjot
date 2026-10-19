import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { DateTimePicker } from './DateTimePicker';
import { useDismiss } from '../lib/useDismiss';

type DateFieldProps = {
  label: string;

  /* The chosen day as YYYY-MM-DD. */
  value: string;
  onChange: (value: string) => void;
};

const two = (value: number) => String(value).padStart(2, '0');


/* =========================
   Date Field
   ========================= */

/* A day in a form, in the app's own style: a button showing the day, which opens a month */
/* calendar under it. The arrow keys move the day; clicking a day (or Enter) closes it, and so */
/* do Escape and a click outside. */
export function DateField({ label, value, onChange }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const popover = useRef<HTMLSpanElement>(null);
  const id = useId();
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  useDismiss(open, `[data-date-field="${id}"]`, () => setOpen(false));

  /* The calendar opens under the field's left edge, or under its right edge when there is no */
  /* room for it to the right (a field at the right of a panel). */
  useLayoutEffect(() => {
    if (!open) {
      setAtEnd(false);
      return;
    }
    const box = popover.current?.getBoundingClientRect();
    if (box && box.right > window.innerWidth - 8) setAtEnd(true);
  }, [open]);

  return (
    <span className="date-field" data-date-field={id}>
      <button type="button" className="date-field-button" aria-label={`${label}: ${date.toLocaleDateString()}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="calendar-days" size={14} />
        {date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
      </button>
      {open && (
        <span
          ref={popover}
          className={`date-field-popover ${atEnd ? 'is-end' : ''}`}
          role="dialog"
          aria-label={label}
          onClick={event => {
            if ((event.target as Element).closest('.date-picker-day')) setOpen(false);
          }}
        >
          <DateTimePicker dateOnly value={date} onChange={chosen => onChange(`${chosen.getFullYear()}-${two(chosen.getMonth() + 1)}-${two(chosen.getDate())}`)} />
        </span>
      )}
    </span>
  );
}
