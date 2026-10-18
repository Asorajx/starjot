import { useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { opensNewTab, type OpenById } from '../lib/clicks';
import { useNow } from '../lib/useNow';
import { ReminderList } from '../app/Reminders';
import { reminderGroups } from '../notespace/reminders';
import { usePreferences } from '../app/preferences';
import { editedText, newestFirst } from '../notespace/NoteList';
import { createNote, noteTitle, updateNote, useNotes } from '../notespace/store';
import { BOARD_TABS } from '../boardspace/data';
import { TASKS } from '../../backend/data/sampleTasks';
import { readQuickNoteDraft, writeQuickNoteDraft } from '../../backend/storage/draftStorage';
import type { BoardTab, StatusTab } from '../../shared/types/task';
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
/* line. The text is kept as a draft until it is saved. */
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
    const note = createNote();
    updateNote(note.id, parts);
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
  const columns = BOARD_TABS.filter((view): view is { id: StatusTab; label: string } => view.id !== 'timeline');

  return (
    <div className="content-pad starjot-home">
      <header className="starjot-home-intro">
        <p className="starjot-home-time">
          {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} · {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </p>
        <h1>{greeting(now)}</h1>
        <p className="starjot-home-subtitle">{spaces.notes ? 'Pick up where you left off, or jot something down.' : 'Here is where your board stands.'}</p>
      </header>

      {spaces.notes && <section className="home-section" aria-labelledby="home-notespace">
        <div className="home-section-heading">
          <h2 id="home-notespace"><Icon name="book-open" size={16} /> Notespace</h2>
          <button type="button" className="btn btn-sm btn-tertiary" onClick={event => onOpenNotespace(opensNewTab(event))}>Open Notespace <Icon name="arrow-right" size={14} /></button>
        </div>
        <div className="starjot-home-grid">
          <QuickNote onOpenNote={onOpenNote} />
          {lastEdited && (
            <div className="home-resume">
              <span className="home-card-label">Where you left off</span>
              <span className="note-tile-title">
                {lastEdited.icon ? <span className="note-tile-icon" aria-hidden="true">{lastEdited.icon}</span> : <Icon name="file-text" size={16} />}
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
          <h2 id="home-boardspace"><Icon name="layout-dashboard" size={16} /> Boardspace</h2>
          <button type="button" className="btn btn-sm btn-tertiary" onClick={onOpenBoardspace}>Open Boardspace <Icon name="arrow-right" size={14} /></button>
        </div>
        <div className="board-summary">
          {columns.map(column => (
            <button key={column.id} type="button" className="board-summary-item" onClick={() => onOpenBoardView(column.id)}>
              <span className="board-summary-count">{TASKS[column.id].length}</span>
              <span>{column.label}</span>
            </button>
          ))}
        </div>
      </section>}
    </div>
  );
}
