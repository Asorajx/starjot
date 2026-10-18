import { useSyncExternalStore } from 'react';
import { readInbox, writeInbox } from '../../backend/storage/inboxStorage';


/* =========================
   Inbox
   ========================= */

/* A notification: for now, a reminder in a note that came due. It is unread until opened or */
/* marked as read, and stays in the inbox until archived (Archived lists those). */
export type InboxItem = {
  id: string;
  kind: 'reminder';
  noteId: string;
  reminderId: string;

  /* When the reminder was for, and the words of its line when it came due. */
  at: string;
  context: string;
  createdAt: string;
  read: boolean;
  archived: boolean;
};

/* The most notifications kept; the oldest archived ones go first. */
const INBOX_LIMIT = 300;

function loadItem(raw: unknown): InboxItem | null {
  const record = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const text = (key: string, max = 120) => String(record[key] ?? '').slice(0, max);
  if (record.kind !== 'reminder' || !text('id') || !text('noteId') || Number.isNaN(Date.parse(text('at')))) return null;
  return {
    id: text('id'),
    kind: 'reminder',
    noteId: text('noteId'),
    reminderId: text('reminderId'),
    at: new Date(text('at')).toISOString(),
    context: text('context', 300),
    createdAt: Number.isNaN(Date.parse(text('createdAt'))) ? new Date().toISOString() : new Date(text('createdAt')).toISOString(),
    read: record.read === true,
    archived: record.archived === true
  };
}

let items: InboxItem[] = readInbox().map(loadItem).filter((item): item is InboxItem => item !== null);
const listeners = new Set<() => void>();

function change(next: InboxItem[]) {
  const archived = next.filter(item => item.archived);
  const overflow = Math.max(0, next.length - INBOX_LIMIT);
  const dropped = new Set(archived.slice(0, overflow).map(item => item.id));
  items = next.filter(item => !dropped.has(item.id));
  writeInbox(items);
  listeners.forEach(listener => listener());
}

/* The key telling one reminder at one time apart, so it is notified once; moving the reminder to */
/* a new time makes a new notification when that time comes. */
export function reminderKey(noteId: string, reminderId: string, at: string) {
  return `${noteId}:${reminderId}:${at}`;
}

export function hasNotified(key: string) {
  return items.some(item => reminderKey(item.noteId, item.reminderId, item.at) === key);
}

/* Add a reminder that came due, newest first; returns the new notification. */
export function notifyReminder(reminder: { noteId: string; id: string; at: string; context: string }) {
  const item: InboxItem = {
    id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    kind: 'reminder',
    noteId: reminder.noteId,
    reminderId: reminder.id,
    at: reminder.at,
    context: reminder.context,
    createdAt: new Date().toISOString(),
    read: false,
    archived: false
  };
  change([item, ...items]);
  return item;
}

export function markRead(id: string, read = true) {
  change(items.map(item => (item.id === id ? { ...item, read } : item)));
}

export function markAllRead() {
  change(items.map(item => (item.archived ? item : { ...item, read: true })));
}

/* Archiving clears a notification from the inbox (it counts as read); it can be brought back. */
export function archive(id: string, archived = true) {
  change(items.map(item => (item.id === id ? { ...item, archived, read: item.read || archived } : item)));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/* Every notification, newest first (archived ones included). */
export function inboxItems() {
  return items;
}

export function useInbox() {
  return useSyncExternalStore(subscribe, inboxItems);
}

/* How many notifications are unread (archived ones never count). */
export function unreadCount(list: InboxItem[]) {
  return list.filter(item => !item.read && !item.archived).length;
}
