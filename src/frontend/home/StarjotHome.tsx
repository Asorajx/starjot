import { useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { opensNewTab, type OpenById } from '../lib/clicks';
import { useNow } from '../lib/useNow';
import { ReminderList } from '../app/Reminders';
import { reminderGroups } from '../notespace/reminders';
import { usePreferences } from '../app/preferences';
import { editedText, newestFirst } from '../notespace/NoteList';
import { createSavedNote, noteIcon, noteTitle, useNotes } from '../notespace/store';
import { showToast } from '../lib/toasts';
import { useBoard } from '../boardspace/board';
import { projectSummary } from '../boardspace/summary/summaryStats';
import { WORK_STATUSES } from '../boardspace/workItems';
import { readQuickNoteDraft, writeQuickNoteDraft } from '../../backend/storage/draftStorage';
import type { BoardTab } from '../../shared/types/board';
import { quickNoteParts } from './quickNote';

type StarjotHomeProps = {
  onOpenNote: OpenById;
  onOpenNotespace: (inNewTab?: boolean) => void;
  onOpenBoardspace: () => void;
  onOpenBoardView: (view: BoardTab) => void;
};

/* After midnight it is still "evening" until 5 am. */
function greeting(now: Date) {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}


/* =========================
   Quick Note
   ========================= */

/* One plain box: Save (or Ctrl + Enter) makes a note without a category, titled from the first */
/* line. The text is kept as a draft until it is saved, and only cleared once the note really is: */
/* when saving fails, it stays in the box (and the draft), and a message says so. */
function QuickNote({ onOpenNote }: { onOpenNote: OpenById }) {
  const [text, setText] = useState(readQuickNoteDraft);
  const [saved, setSaved] = useState<{ id: string; title: string } | null>(null);

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

  return (
    <form className="quick-note" onSubmit={save}>
      <label className="home-card-label" htmlFor="quick-note-text">Quick note</label>
      <textarea
        id="quick-note-text"
        className="quick-note-text"
        rows={5}
        placeholder="Jot something down. The first line becomes the title."
        value={text}
        onChange={event => change(event.target.value)}
        onKeyDown={event => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') save(event);
        }}
      />
      <div className="home-card-footer">
        <span className="quick-note-status" role="status">
          {saved
            ? <>Saved “{saved.title}”. <button type="button" className="text-link" onClick={event => onOpenNote(saved.id, opensNewTab(event))}>Open it</button></>
            : 'Ctrl + Enter saves'}
        </span>
        <button className="btn btn-sm btn-primary" type="submit" disabled={!text.trim()}>Save</button>
      </div>
    </form>
  );
}


/* =========================
   Starjot Home
   ========================= */

/* The app's own home: a greeting, then one section per space turned on, so notes and boards are */
/* never mixed. Notespace has a quick note, "Where you left off" and reminders still to come today; */
/* Boardspace has how many items each column holds. */
export function StarjotHome({ onOpenNote, onOpenNotespace, onOpenBoardspace, onOpenBoardView }: StarjotHomeProps) {
  const now = useNow(30000);
  const { spaces } = usePreferences();
  const notes = useNotes();
  const lastEdited = newestFirst(notes)[0];
  const reminders = reminderGroups(notes, now);
  const board = useBoard();
  const work = projectSummary(board);

  return (
    <div className="content-pad starjot-home">
      <header className="starjot-home-intro">
        <p className="starjot-home-time">
          {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} · {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </p>
        <h1>{greeting(now)}</h1>
      </header>

      {spaces.notes && <section className="home-section" aria-labelledby="home-notespace">
        {/* The heading itself opens the space, where reading starts, rather than a button far off */}
        {/* at the other end of the row. */}
        <div className="home-section-heading">
          <h2 id="home-notespace">
            <button type="button" className="home-section-link" aria-label="Open Notespace" onClick={event => onOpenNotespace(opensNewTab(event))}>
              <Icon name="book-open" size={16} /> Notespace <Icon name="chevron-right" size={16} className="home-section-chevron" />
            </button>
          </h2>
        </div>
        <div className="starjot-home-grid">
          <QuickNote onOpenNote={onOpenNote} />
          {lastEdited && (
            <div className="home-resume">
              <span className="home-card-label">Where you left off</span>
              <span className="note-tile-title">
                {lastEdited.icon ? <span className="note-tile-icon" aria-hidden="true">{lastEdited.icon}</span> : <Icon name={noteIcon(lastEdited)} size={16} />}
                <strong>{noteTitle(lastEdited)}</strong>
              </span>
              <span className="note-tile-text">{lastEdited.subtitle || lastEdited.preview || 'No content yet.'}</span>
              <span className="home-card-footer">
                <span className="note-tile-meta">{editedText(lastEdited)}</span>
                <button className="btn btn-sm btn-secondary" type="button" onClick={event => onOpenNote(lastEdited.id, opensNewTab(event))}>Continue <Icon name="arrow-right" size={14} /></button>
              </span>
            </div>
          )}
        </div>

        {/* Reminders still to come today, when there are any (ones that came due are in the inbox). */}
        {reminders.today.length > 0 && (
          <div className="home-reminders">
            <span className="home-card-label">Reminders</span>
            <ReminderList groups={['today']} now={now} onOpenNote={onOpenNote} empty="" />
          </div>
        )}
      </section>}

      {spaces.boardspace && <section className="home-section" aria-labelledby="home-boardspace">
        <div className="home-section-heading">
          <h2 id="home-boardspace">
            <button type="button" className="home-section-link" aria-label="Open Boardspace" onClick={onOpenBoardspace}>
              <Icon name="layout-dashboard" size={16} /> Boardspace <Icon name="chevron-right" size={16} className="home-section-chevron" />
            </button>
          </h2>
        </div>
        {/* The project's cards per status (each opening the Board), then what is overdue (the Summary). */}
        {/* With no work yet, a line and a button to start instead of a row of zeros. */}
        {!board.items.length ? (
          <div className="board-summary-empty">
            <p>No work yet. Plan sprints and tasks in Boardspace.</p>
            <button type="button" className="btn btn-secondary" onClick={onOpenBoardspace}>Open Boardspace <Icon name="arrow-right" size={16} /></button>
          </div>
        ) : <div className="board-summary">
          {work.byStatus.map(entry => (
            <button key={entry.status} type="button" className="board-summary-item" onClick={() => onOpenBoardView('board')}>
              <span className="board-summary-count">{entry.count}</span>
              <span className="board-summary-label"><span className={`work-status-dot work-status-dot--${entry.status}`} />{WORK_STATUSES[entry.status]}</span>
            </button>
          ))}
          <button type="button" className="board-summary-item" onClick={() => onOpenBoardView('summary')}>
            <span className="board-summary-count">{work.overdue.length}</span>
            <span className="board-summary-label">{work.overdue.length > 0 && <Icon name="alert-triangle" size={13} className="board-summary-alert" />}Overdue</span>
          </button>
        </div>}
      </section>}
    </div>
  );
}
