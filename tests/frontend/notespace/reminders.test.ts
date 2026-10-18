import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createReminderChip, hydrateReminders, reminderChoices, reminderGroups, reminderLabel, remindersIn
} from '../../../src/frontend/notespace/reminders';
import { cleanHtml } from '../../../src/frontend/notespace/sanitize';
import type { Note } from '../../../src/shared/types/note';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

const NOW = new Date(2026, 9, 18, 15, 0);

/* A reminder chip as stored, for a time. */
function chip(id: string, at: Date) {
  return `<span class="reminder-chip" data-reminder="${id}" data-at="${at.toISOString()}"></span>`;
}

/* A note with only what reminders look at. */
function note(id: string, content: string) {
  return { id, content } as Note;
}


/* =========================
   Reminders in the Text
   ========================= */

describe('reminders in the text', () => {
  it('are found in notes with the words of their line, and grouped soonest first', () => {
    const notes = [
      note('a', `<p>Call Sam ${chip('r1', new Date(2026, 9, 19, 9, 0))}</p><p>Pay rent ${chip('r2', new Date(2026, 9, 17, 9, 0))}</p>`),
      note('b', `<ul><li>Send the draft ${chip('r3', new Date(2026, 9, 18, 18, 0))}</li></ul>`)
    ];
    expect(remindersIn(notes[0]).map(reminder => reminder.context)).toEqual(['Call Sam', 'Pay rent']);
    const groups = reminderGroups(notes, NOW);
    expect(groups.due.map(reminder => reminder.id)).toEqual(['r2']);
    expect(groups.today.map(reminder => reminder.id)).toEqual(['r3']);
    expect(groups.later.map(reminder => reminder.id)).toEqual(['r1']);
  });

  it('are stored empty with their id and time, and drawn with "@", the time and an alarm', () => {
    const made = createReminderChip(new Date(2026, 9, 19, 9, 0));
    const holder = document.createElement('div');
    holder.append(made);
    hydrateReminders(holder, NOW);
    expect(made.textContent).toMatch(/^@Tomorrow /);
    expect(made.querySelector('svg')).not.toBeNull();
    expect(made.getAttribute('contenteditable')).toBe('false');
    expect(cleanHtml(holder.innerHTML)).toBe(`<span class="reminder-chip" data-reminder="${made.dataset.reminder}" data-at="${made.dataset.at}"></span>`);
    expect(cleanHtml('<span class="reminder-chip is-due" data-reminder="bad id" data-at="never" data-done="yes">x</span>')).toBe('<span class="reminder-chip"></span>');
  });

  it('change in a note\'s saved text: a new time, or removed', async () => {
    const store = await import('../../../src/frontend/notespace/store');
    const { changeReminder } = await import('../../../src/frontend/notespace/reminders');
    const made = store.createNote();
    store.updateNote(made.id, { content: `<p>Call ${chip('r1', new Date(2026, 9, 19, 9, 0))}</p>` });
    changeReminder(made.id, 'r1', { at: new Date(2026, 9, 20, 9, 0) });
    expect(store.getNote(made.id)?.content).toBe(`<p>Call ${chip('r1', new Date(2026, 9, 20, 9, 0))}</p>`);
    changeReminder(made.id, 'r1', 'remove');
    expect(store.getNote(made.id)?.content).toBe('<p>Call </p>');
  });

  it('offer later today, tomorrow and next Monday', () => {
    expect(reminderChoices(NOW).map(choice => choice.at.getTime())).toEqual([
      new Date(2026, 9, 18, 17, 0).getTime(),
      new Date(2026, 9, 19, 9, 0).getTime(),
      new Date(2026, 9, 19, 9, 0).getTime()
    ]);
  });

  it('name the day as today, tomorrow or yesterday', () => {
    expect(reminderLabel(new Date(2026, 9, 18, 18, 0).toISOString(), NOW)).toMatch(/^Today /);
    expect(reminderLabel(new Date(2026, 9, 17, 9, 0).toISOString(), NOW)).toMatch(/^Yesterday /);
    expect(reminderLabel(new Date(2027, 0, 5, 9, 0).toISOString(), NOW)).toContain('2027');
  });
});
