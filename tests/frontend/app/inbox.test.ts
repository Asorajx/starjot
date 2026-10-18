import { beforeEach, describe, expect, it, vi } from 'vitest';

/* The inbox loads saved notifications when it is first imported, so each test clears storage */
/* and imports a fresh copy, like opening the app again. */
beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

function openInbox() {
  return import('../../../src/frontend/app/inbox');
}

const REMINDER = { noteId: 'atlas', id: 'r1', at: new Date(2026, 9, 18, 9, 0).toISOString(), context: 'Call Sam' };


/* =========================
   Inbox
   ========================= */

describe('inbox', () => {
  it('notifies a reminder once for its time, and again when it is moved to another time', async () => {
    const inbox = await openInbox();
    const key = inbox.reminderKey(REMINDER.noteId, REMINDER.id, REMINDER.at);
    expect(inbox.hasNotified(key)).toBe(false);
    inbox.notifyReminder(REMINDER);
    expect(inbox.hasNotified(key)).toBe(true);
    expect(inbox.hasNotified(inbox.reminderKey('atlas', 'r1', new Date(2026, 9, 19, 9, 0).toISOString()))).toBe(false);
  });

  it('counts unread notifications, which marking as read or archiving clears', async () => {
    const inbox = await openInbox();
    const first = inbox.notifyReminder(REMINDER);
    const second = inbox.notifyReminder({ ...REMINDER, id: 'r2' });
    const count = () => inbox.unreadCount(inbox.inboxItems());
    expect(count()).toBe(2);
    inbox.markRead(first.id);
    expect(count()).toBe(1);
    inbox.markRead(first.id, false);
    inbox.archive(second.id);
    expect(count()).toBe(1);
    inbox.markAllRead();
    expect(count()).toBe(0);
  });

  it('keeps notifications, read or not, until archived, and after reopening', async () => {
    let inbox = await openInbox();
    const item = inbox.notifyReminder(REMINDER);
    inbox.markRead(item.id);
    vi.resetModules();
    inbox = await openInbox();
    expect(inbox.inboxItems()).toMatchObject([{ id: item.id, read: true, archived: false, context: 'Call Sam' }]);
    inbox.archive(item.id);
    expect(inbox.inboxItems()[0]).toMatchObject({ archived: true, read: true });
  });
});
