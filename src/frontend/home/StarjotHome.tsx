import { useState, type FocusEvent, type FormEvent, type MouseEvent } from 'react';
import { Icon } from '../components/Icon';
import { opensNewTab, type OpenById } from '../lib/clicks';
import { useNow } from '../lib/useNow';
import { ReminderList } from '../app/Reminders';
import { reminderGroups } from '../notespace/reminders';
import { usePreferences } from '../app/preferences';
import { editedText, newestFirst, StarButton, starredNotes } from '../notespace/NoteList';
import { categoryName, createSavedNote, noteIcon, noteTitle, useNotes } from '../notespace/store';
import { showToast } from '../lib/toasts';
import { useBoard } from '../boardspace/board';
import { isoDay, shortDay } from '../boardspace/dates';
import { openNewTask, openWorkItem } from '../boardspace/openWork';
import { projectSummary } from '../boardspace/summary/summaryStats';
import { WORK_STATUSES } from '../boardspace/workItems';
import { readQuickNoteDraft, writeQuickNoteDraft } from '../../backend/storage/draftStorage';
import type { BoardTab, WorkItem, WorkStatus } from '../../shared/types/board';
import type { Note } from '../../shared/types/note';
import { quickNoteParts } from './quickNote';

type StarjotHomeProps = {
  onOpenNote: OpenById;
  onOpenNotespace: (inNewTab?: boolean) => void;
  onOpenBoardspace: () => void;
  onOpenBoardView: (view: BoardTab) => void;
};

/* How many notes "Continue working" shows, and how many due work items Today lists before */
/* pointing to the Summary for the rest. */
const CONTINUE_COUNT = 4;
const DUE_SHOWN = 6;

/* After midnight it is still "evening" until 5 am. */
function greeting(now: Date) {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;


/* =========================
   Quick Capture
   ========================= */

/* One line to jot into, opening into a box with Add note while it is in use (focused, or */
/* holding text or a just-saved message). Add note (or Ctrl + Enter) makes a note without a */
/* category, titled from the first line. The text is kept as a draft until it is saved, and only */
/* cleared once the note really is: when saving fails, it stays in the box (and the draft), and a */
/* message says so. */
function QuickCapture({ onOpenNote }: { onOpenNote: OpenById }) {
  const [text, setText] = useState(readQuickNoteDraft);
  const [saved, setSaved] = useState<{ id: string; title: string } | null>(null);
  const [focused, setFocused] = useState(false);
  const open = focused || Boolean(text) || Boolean(saved);

  function change(value: string) {
    setText(value);
    setSaved(null);
    writeQuickNoteDraft(value);
  }

  function save(event?: FormEvent) {
    event?.preventDefault();
    const parts = quickNoteParts(text);
    if (!parts) return;
    const note = createSavedNote(parts);
    if (!note) {
      showToast({
        kind: 'error',
        title: 'Could not save the quick note',
        description: "This browser's storage is full or unavailable. Your text is still in the box.",
        stay: true,
        action: { label: 'Copy text', run: () => void navigator.clipboard?.writeText(text).catch(() => undefined) }
      });
      return;
    }
    setText('');
    writeQuickNoteDraft('');
    setSaved({ id: note.id, title: parts.title });
  }

  /* Moving between the box and its button keeps it open. */
  function blur(event: FocusEvent<HTMLFormElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
  }

  /* A click anywhere on the bar (its icon or edge) puts the caret in the box. */
  function focusBox(event: MouseEvent<HTMLFormElement>) {
    if (!(event.target as Element).closest('textarea, button')) event.currentTarget.querySelector('textarea')?.focus();
  }

  return (
    <form className={`quick-capture ${open ? 'is-open' : ''}`} onSubmit={save} onFocus={() => setFocused(true)} onBlur={blur} onClick={focusBox}>
      <span className="quick-capture-icon" aria-hidden="true"><Icon name="pencil" size={18} /></span>
      <div className="quick-capture-main">
        <label htmlFor="quick-note-text">Quick capture</label>
        <textarea
          id="quick-note-text"
          className="quick-capture-text"
          rows={open ? 3 : 1}
          placeholder="Jot something down. The first line becomes the title."
          value={text}
          onChange={event => change(event.target.value)}
          onKeyDown={event => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') save(event);
          }}
        />
        {open && (
          <span className="quick-capture-status" role="status">
            {saved
              ? <>Saved “{saved.title}”. <button type="button" className="text-link" onClick={event => onOpenNote(saved.id, opensNewTab(event))}>Open it</button></>
              : 'Ctrl + Enter adds it'}
          </span>
        )}
      </div>
      {open
        ? <button className="btn btn-primary btn-sm quick-capture-add" type="submit" disabled={!text.trim()}>Add note</button>
        : <kbd className="quick-capture-key hint">Ctrl ⏎</kbd>}
    </form>
  );
}


/* =========================
   Continue Working
   ========================= */

/* A note's square: its colour (or the accent, without one) behind its emoji or kind icon. */
function NoteTile({ note }: { note: Note }) {
  return (
    <span className={`home-note-tile ${note.color ? `text-${note.color}` : ''}`} aria-hidden="true">
      {note.icon ? <span className="home-note-emoji">{note.icon}</span> : <Icon name={noteIcon(note)} size={20} />}
    </span>
  );
}

/* The notes edited last, or the starred ones: a card each with its square, title, first words, */
/* category and edit time, opening with a click (Ctrl + click for a new tab), and its star. */
function ContinueWorking({ onOpenNote, onOpenNotespace }: Pick<StarjotHomeProps, 'onOpenNote' | 'onOpenNotespace'>) {
  const notes = useNotes();
  const [show, setShow] = useState<'recent' | 'starred'>('recent');
  const shown = (show === 'recent' ? newestFirst(notes) : starredNotes(notes)).slice(0, CONTINUE_COUNT);

  return (
    <section className="home-continue" aria-labelledby="home-continue">
      <div className="home-section-row">
        <h2 id="home-continue">Continue working</h2>
        <div className="home-switch" role="group" aria-label="Show">
          <button type="button" aria-pressed={show === 'recent'} onClick={() => setShow('recent')}>Recent</button>
          <button type="button" aria-pressed={show === 'starred'} onClick={() => setShow('starred')}>Starred</button>
        </div>
      </div>
      {shown.length > 0 ? (
        <ul className="home-cards">
          {shown.map(note => {
            const category = categoryName(note.category);
            return (
              <li key={note.id} className="home-card">
                <NoteTile note={note} />
                <button type="button" className="home-card-open" data-preview-page={note.id} onClick={event => onOpenNote(note.id, opensNewTab(event))}>
                  <strong>{noteTitle(note)}</strong>
                  <span className="home-card-text">{note.subtitle || note.preview || 'No content yet.'}</span>
                  <span className="home-card-meta">
                    {category && <span className="home-card-tag">{category}</span>}
                    {editedText(note)}
                  </span>
                </button>
                <StarButton note={note} className="home-card-star" />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="home-empty">{show === 'starred' ? 'No starred notes yet. Star a note to keep it here.' : 'Notes you write show here.'}</p>
      )}
      <button type="button" className="home-link" onClick={event => onOpenNotespace(opensNewTab(event))}>
        All notes <Icon name="arrow-right" size={14} />
      </button>
    </section>
  );
}


/* =========================
   Today
   ========================= */

type TodayProps = {
  now: Date;
  showNotes: boolean;
  showBoard: boolean;
  onOpenNote: OpenById;
  onOpenBoardView: (view: BoardTab) => void;
};

/* What needs attention today: reminders still to come today, then Boardspace work that is */
/* overdue or due within a week, earliest first, each opening where it is. Add task opens */
/* Boardspace's editor for a new task. With nothing due, it says all is caught up. */
function Today({ now, showNotes, showBoard, onOpenNote, onOpenBoardView }: TodayProps) {
  const notes = useNotes();
  const board = useBoard();
  const reminders = showNotes ? reminderGroups(notes, now).today : [];
  const work = showBoard ? projectSummary(board) : null;
  const due = work ? [...work.overdue, ...work.dueSoon] : [];
  const day = isoDay(now);

  function openWork(item: WorkItem) {
    onOpenBoardView(item.type === 'epic' ? 'list' : 'board');
    openWorkItem(item.id);
  }

  function addTask() {
    onOpenBoardView('board');
    openNewTask();
  }

  return (
    <section className="home-today" aria-labelledby="home-today">
      <div className="home-section-row">
        <h2 id="home-today">Today</h2>
        {showBoard && (
          <button type="button" className="home-link" onClick={addTask}>
            <Icon name="plus" size={14} /> Add task
          </button>
        )}
      </div>
      <div className="home-panel">
        {reminders.length > 0 && (
          <div className="home-today-group">
            <span className="home-label">Reminders</span>
            <ReminderList groups={['today']} now={now} onOpenNote={onOpenNote} empty="" />
          </div>
        )}
        {due.length > 0 && (
          <div className="home-today-group">
            <span className="home-label">Due work</span>
            <ul className="home-due">
              {due.slice(0, DUE_SHOWN).map(item => {
                const late = item.end < day;
                return (
                  <li key={item.id}>
                    <button type="button" className="home-due-item" onClick={() => openWork(item)}>
                      <span className={`work-status-dot work-status-dot--${item.status}`} aria-hidden="true" />
                      <strong>{item.name}</strong>
                      <span className={late ? 'is-late' : ''}>{late ? `Overdue · ${shortDay(item.end)}` : item.end === day ? 'Due today' : `Due ${shortDay(item.end)}`}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {due.length > DUE_SHOWN && (
              <button type="button" className="text-link home-due-more" onClick={() => onOpenBoardView('summary')}>
                {due.length - DUE_SHOWN} more in the Summary
              </button>
            )}
          </div>
        )}
        {!reminders.length && !due.length && (
          <div className="home-caught-up">
            <span className="home-caught-up-icon" aria-hidden="true"><Icon name="check" size={22} /></span>
            <span>
              <strong>All caught up</strong>
              <span>Nothing due today. Enjoy the breathing room.</span>
            </span>
          </div>
        )}
      </div>
    </section>
  );
}


/* =========================
   Your Spaces
   ========================= */

const STATUS_ORDER: WorkStatus[] = ['todo', 'progress', 'review', 'done', 'blocked'];

/* A tile per space turned on. Boardspace's shows a small picture of the real project: a bar per */
/* status, as tall as its share of the work, with the counts beside. Notespace's counts notes. */
function SpaceTile({ space, onOpenNotespace, onOpenBoardspace }: { space: 'notespace' | 'boardspace' } & Pick<StarjotHomeProps, 'onOpenNotespace' | 'onOpenBoardspace'>) {
  const notes = useNotes();
  const board = useBoard();
  const work = projectSummary(board);
  const busiest = Math.max(1, ...work.byStatus.map(entry => entry.count));
  const count = (status: WorkStatus) => work.byStatus.find(entry => entry.status === status)?.count ?? 0;
  const open = work.total - count('done');

  return (
    <>
      {space === 'boardspace' && (
        <button type="button" className="home-space home-space-board" onClick={onOpenBoardspace}>
          <span className="home-board-heading">
            <span className="home-space-text">
              <strong>Boardspace</strong>
              <span>{work.total ? `${plural(work.total, 'item')} · ${open} open` : 'Plan sprints and tasks'}</span>
              {work.total > 0 && (
                <span className="home-space-detail">
                  {STATUS_ORDER.filter(status => count(status)).map(status => `${count(status)} ${WORK_STATUSES[status].toLowerCase()}`).join(' · ')}
                </span>
              )}
            </span>
            <Icon name="arrow-right" size={16} className="home-space-arrow" />
          </span>
          <span className="home-board-picture" aria-hidden="true">
            {STATUS_ORDER.map(status => (
              <span key={status} className="home-board-bar" style={{ height: `${Math.max(8, (count(status) / busiest) * 100)}%`, background: `var(--status-${status})`, opacity: count(status) ? 1 : 0.25 }} />
            ))}
          </span>
        </button>
      )}
      {space === 'notespace' && (
        <button type="button" className="home-space" onClick={event => onOpenNotespace(opensNewTab(event))}>
          <span className="home-space-icon" aria-hidden="true"><Icon name="book-open" size={18} /></span>
          <span className="home-space-text">
            <strong>Notespace</strong>
            <span>{plural(notes.length, 'note')} · {plural(starredNotes(notes).length, 'starred note')}</span>
          </span>
          <Icon name="arrow-right" size={16} className="home-space-arrow" />
        </button>
      )}
    </>
  );
}


/* =========================
   Starjot Home
   ========================= */

/* Show the enabled spaces and their recent activity on Home. */
export function StarjotHome({ onOpenNote, onOpenNotespace, onOpenBoardspace, onOpenBoardView }: StarjotHomeProps) {
  const now = useNow(30000);
  const { spaces } = usePreferences();

  return (
    <div className="content-pad starjot-home">
      <header className="starjot-home-intro">
        <h1>{greeting(now)} <span className="home-star" aria-hidden="true">✦</span></h1>
        <p className="starjot-home-date">
          <span className="home-date-dot" aria-hidden="true" />
          {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} · {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </p>
      </header>
      <div className="starjot-home-layout">
        {spaces.notes && <div className="home-bento home-bento-capture"><QuickCapture onOpenNote={onOpenNote} /></div>}
        {spaces.notes && (
          <div className="home-main">
            <div className="home-bento home-bento-notespace"><SpaceTile space="notespace" onOpenNotespace={onOpenNotespace} onOpenBoardspace={onOpenBoardspace} /></div>
            <div className="home-bento home-bento-continue"><ContinueWorking onOpenNote={onOpenNote} onOpenNotespace={onOpenNotespace} /></div>
          </div>
        )}
        <div className="home-side">
          {spaces.boardspace && <div className="home-bento home-bento-boardspace"><SpaceTile space="boardspace" onOpenNotespace={onOpenNotespace} onOpenBoardspace={onOpenBoardspace} /></div>}
          <div className="home-bento home-bento-today"><Today now={now} showNotes={spaces.notes} showBoard={spaces.boardspace} onOpenNote={onOpenNote} onOpenBoardView={onOpenBoardView} /></div>
        </div>
      </div>
    </div>
  );
}
