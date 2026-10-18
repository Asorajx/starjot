import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { useDismiss } from '../lib/useDismiss';
import { useNow } from '../lib/useNow';
import { closeToast, showToast } from '../lib/toasts';
import { opensNewTab, type OpenById } from '../lib/clicks';
import { getNote, noteTitle, useNotes } from '../notespace/store';
import { fullReminderLabel, isDue, reminderGroups, reminderLabel, type Reminder } from '../notespace/reminders';
import { archive, hasNotified, markAllRead, markRead, notifyReminder, reminderKey, unreadCount, useInbox, type InboxItem } from './inbox';


/* =========================
   Reminders Coming Due
   ========================= */

/* Watches for reminders coming due while Starjot is open (and ones that came due while it was */
/* closed, as soon as it opens). Each becomes a notification in the inbox and a toast with Open; */
/* closing the toast leaves the notification in the inbox. Draws nothing itself. */
export function ReminderWatcher({ onOpenNote }: { onOpenNote: OpenById }) {
  const notes = useNotes();
  const now = useNow();
  const latest = useRef(onOpenNote);
  latest.current = onOpenNote;

  useEffect(() => {
    reminderGroups(notes, now).due
      .filter(reminder => !hasNotified(reminderKey(reminder.noteId, reminder.id, reminder.at)))
      .forEach(reminder => {
        const item = notifyReminder(reminder);
        showToast({
          id: `reminder-${item.id}`,
          kind: 'info',
          icon: 'alarm-clock',
          title: `Reminder in ${noteTitle(getNote(reminder.noteId))}`,
          description: [reminder.context, fullReminderLabel(reminder.at)].filter(Boolean).join(' · '),
          stay: true,
          action: {
            label: 'Open',
            run: () => {
              markRead(item.id);
              latest.current(reminder.noteId);
            }
          }
        });
      });
  }, [notes, now]);
  return null;
}


/* =========================
   Inbox
   ========================= */

type InboxFilter = 'all' | 'unread' | 'archived';

const FILTERS: { value: InboxFilter; label: string; icon: 'inbox' | 'bell' | 'archive' }[] = [
  { value: 'all', label: 'Unread & read', icon: 'inbox' },
  { value: 'unread', label: 'Unread', icon: 'bell' },
  { value: 'archived', label: 'Archived', icon: 'archive' }
];

/* "5 min", "3 h", "Yesterday" or "Jul 21": when a notification arrived. */
function arrivedLabel(at: string, now: Date) {
  const minutes = Math.round((now.getTime() - Date.parse(at)) / 60000);
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h`;
  if (minutes < 48 * 60) return 'Yesterday';
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/* One notification: "Reminder in" its note, the reminder's words and date (red once past), when */
/* it arrived, and a dot while unread. Clicking it opens the note and marks it read; Mark as read */
/* (or unread) and Archive (or Restore) show while it is pointed at or focused. */
function InboxRow({ item, now, onOpenNote }: { item: InboxItem; now: Date; onOpenNote: OpenById }) {
  const note = getNote(item.noteId);
  return (
    <li className={`inbox-row ${item.read ? '' : 'is-unread'}`}>
      <button
        type="button"
        className="inbox-row-open"
        disabled={!note}
        onClick={event => {
          markRead(item.id);
          onOpenNote(item.noteId, opensNewTab(event));
        }}
      >
        <Icon name="alarm-clock" size={18} />
        <span className="inbox-row-text">
          <span className="inbox-row-title">Reminder in <strong><Icon name="file-text" size={13} /> {note ? noteTitle(note) : 'a deleted note'}</strong></span>
          {item.context && <span className="inbox-row-context">{item.context}</span>}
          <span className={`inbox-row-date ${Date.parse(item.at) <= now.getTime() ? 'is-past' : ''}`}>
            {fullReminderLabel(item.at)} <Icon name="alarm-clock" size={13} />
          </span>
        </span>
        <span className="inbox-row-time">{arrivedLabel(item.createdAt, now)}</span>
      </button>
      {!item.read && <span className="inbox-row-dot" aria-label="Unread" />}
      <span className="inbox-row-actions">
        {!item.archived && (
          <button type="button" className="inbox-action" aria-label={item.read ? 'Mark as unread' : 'Mark as read'} data-tooltip={item.read ? 'Mark as unread' : 'Mark as read'} data-tooltip-side="left" onClick={() => markRead(item.id, !item.read)}>
            <Icon name={item.read ? 'bell' : 'check'} size={14} />
          </button>
        )}
        <button type="button" className="inbox-action" aria-label={item.archived ? 'Restore' : 'Archive'} data-tooltip={item.archived ? 'Restore' : 'Archive'} data-tooltip-side="left" onClick={() => archive(item.id, !item.archived)}>
          <Icon name={item.archived ? 'archive-restore' : 'archive'} size={14} />
        </button>
      </span>
    </li>
  );
}

/* The bell beside the sidebar button, showing how many notifications are unread. Clicking it */
/* opens the inbox: notifications newest first, filtered to all, unread or archived, with Mark */
/* all as read. Notifications stay until archived. */
export function InboxBell({ onOpenNote }: { onOpenNote: OpenById }) {
  const items = useInbox();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [choosing, setChoosing] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useDismiss(open, '.window-notifications, .inbox-panel', () => setOpen(false));
  const unread = unreadCount(items);
  const shown = items.filter(item => (filter === 'archived' ? item.archived : !item.archived && (filter === 'all' || !item.read)));
  const box = open ? button.current?.getBoundingClientRect() : null;
  const empty = { all: 'No notifications. Reminders you add with / → Reminder arrive here when they are due.', unread: 'Nothing unread.', archived: 'Nothing archived.' }[filter];

  return (
    <>
      <button
        ref={button}
        type="button"
        className="window-control window-notifications"
        aria-label={unread ? `Inbox, ${unread} unread` : 'Inbox'}
        aria-expanded={open}
        data-tooltip={open ? undefined : 'Inbox'}
        data-tooltip-align="start"
        onClick={() => setOpen(!open)}
      >
        <Icon name="bell" size={17} />
        {unread > 0 && <span className="inbox-badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && box && (
        <div className="page-menu inbox-panel" role="dialog" aria-label="Inbox" style={{ top: box.bottom + 8, left: Math.max(8, Math.min(box.left, window.innerWidth - 368)) }}>
          <div className="inbox-heading">
            <strong>{filter === 'archived' ? 'Archived' : 'Inbox'}</strong>
            <button type="button" className="inbox-action" aria-label="Mark all as read" data-tooltip="Mark all as read" disabled={!unread} onClick={markAllRead}>
              <Icon name="check-check" size={15} />
            </button>
            <span className="inbox-filter">
              <button type="button" className={`inbox-action ${filter !== 'all' ? 'is-active' : ''}`} aria-label="Filter" aria-haspopup="menu" aria-expanded={choosing} data-tooltip={choosing ? undefined : 'Filter'} onClick={() => setChoosing(!choosing)}>
                <Icon name="sliders-horizontal" size={15} />
              </button>
              {choosing && (
                <span className="page-menu inbox-filter-menu" role="menu" aria-label="Show">
                  <span className="inbox-filter-title">Status</span>
                  {FILTERS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={filter === option.value}
                      className="page-menu-item"
                      onClick={() => {
                        setFilter(option.value);
                        setChoosing(false);
                      }}
                    >
                      <span className={`inbox-radio ${filter === option.value ? 'is-on' : ''}`} aria-hidden="true" />
                      <Icon name={option.icon} size={14} /> {option.label}
                    </button>
                  ))}
                </span>
              )}
            </span>
          </div>
          {shown.length
            ? <ul className="inbox-list">{shown.map(item => <InboxRow key={item.id} item={item} now={now} onOpenNote={(id, inNewTab) => {
              setOpen(false);
              closeToast(`reminder-${item.id}`);
              onOpenNote(id, inNewTab);
            }} />)}</ul>
            : <p className="reminder-empty hint">{empty}</p>}
        </div>
      )}
    </>
  );
}


/* =========================
   Coming Up
   ========================= */

/* What a reminder is about: the words of its line, or the note's name when the line has none. */
function reminderTitle(reminder: Reminder) {
  return reminder.context || noteTitle(getNote(reminder.noteId));
}

/* Reminders still to come, later today (and after, when asked), each opening its note. Shown on */
/* Starjot Home, which passes its own time now, so the list and the choice to show it agree; ones */
/* that came due are in the inbox. */
export function ReminderList({ groups, now, onOpenNote, empty }: { groups: ('today' | 'later')[]; now: Date; onOpenNote: OpenById; empty: string }) {
  const notes = useNotes();
  const all = reminderGroups(notes, now);
  const titles = { today: 'Later today', later: 'Coming up' };
  const shown = groups.filter(group => all[group].length);
  if (!shown.length) return <p className="reminder-empty hint">{empty}</p>;
  return (
    <div className="reminder-list">
      {shown.map(group => (
        <section key={group} aria-label={titles[group]}>
          <h3 className="reminder-list-title">{titles[group]}</h3>
          {all[group].map(reminder => (
            <button
              key={`${reminder.noteId}-${reminder.id}`}
              type="button"
              className={`reminder-row ${isDue(reminder, now) ? 'is-due' : ''}`}
              onClick={event => onOpenNote(reminder.noteId, opensNewTab(event))}
            >
              <Icon name="alarm-clock" size={14} />
              <span className="reminder-row-text">
                <span className="reminder-row-title">{reminderTitle(reminder)}</span>
                <small>{noteTitle(getNote(reminder.noteId))}</small>
              </span>
              <span className="reminder-row-time">{reminderLabel(reminder.at, now)}</span>
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}
