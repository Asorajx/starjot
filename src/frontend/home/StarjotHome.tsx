import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { editedText, newestFirst } from '../notespace/NoteList';
import { createNote, updateNote, useNotes } from '../notespace/store';
import { BOARD_TABS } from '../workboard/data';
import { TASKS } from '../../backend/data/sampleTasks';
import { readQuickNoteDraft, writeQuickNoteDraft } from '../../backend/storage/draftStorage';
import type { BoardTab, StatusTab } from '../../shared/types/task';
import { quickNoteParts } from './quickNote';

type StarjotHomeProps = {
  onOpenNote: (id: string) => void;
  onOpenNotespace: () => void;
  onOpenWorkboard: () => void;
  onOpenBoardView: (view: BoardTab) => void;
};

/* After midnight it is still "evening" until 5 am. */
function greeting(now: Date) {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/* The current time, updated every 30 seconds so the clock and greeting stay correct. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}


/* =========================
   Quick Note
   ========================= */

/* One plain box: Save (or Ctrl + Enter) makes a note without a category, titled from the first */
/* line. The text is kept as a draft until it is saved. */
function QuickNote({ onOpenNote }: { onOpenNote: (id: string) => void }) {
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
            ? <>Saved “{saved.title}”. <button type="button" className="text-link" onClick={() => onOpenNote(saved.id)}>Open it</button></>
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

/* The app's own home: a greeting, then one section per space so notes and boards are never mixed. */
/* Notespace has a quick note and "Where you left off"; Workboard has how many items each column holds. */
export function StarjotHome({ onOpenNote, onOpenNotespace, onOpenWorkboard, onOpenBoardView }: StarjotHomeProps) {
  const now = useNow();
  const lastEdited = newestFirst(useNotes())[0];
  const columns = BOARD_TABS.filter((view): view is { id: StatusTab; label: string } => view.id !== 'timeline');

  return (
    <div className="content-pad starjot-home">
      <header className="starjot-home-intro">
        <p className="starjot-home-time">
          {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} · {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </p>
        <h1>{greeting(now)}</h1>
        <p>Pick up where you left off, or jot something down.</p>
      </header>

      <section className="home-section" aria-labelledby="home-notespace">
        <div className="home-section-heading">
          <h2 id="home-notespace"><Icon name="book-open" size={16} /> Notespace</h2>
          <button type="button" className="btn btn-sm btn-tertiary" onClick={onOpenNotespace}>Open Notespace <Icon name="arrow-right" size={14} /></button>
        </div>
        <div className="starjot-home-grid">
          <QuickNote onOpenNote={onOpenNote} />
          {lastEdited && (
            <div className="home-resume">
              <span className="home-card-label">Where you left off</span>
              <span className="note-tile-title">
                {lastEdited.icon ? <span className="note-tile-icon" aria-hidden="true">{lastEdited.icon}</span> : <Icon name="file-text" size={16} />}
                <strong>{lastEdited.title || 'Untitled note'}</strong>
              </span>
              <span className="note-tile-text">{lastEdited.subtitle || lastEdited.preview || 'No content yet.'}</span>
              <span className="home-card-footer">
                <span className="note-tile-meta">{editedText(lastEdited)}</span>
                <button className="btn btn-sm btn-secondary" type="button" onClick={() => onOpenNote(lastEdited.id)}>Continue <Icon name="arrow-right" size={14} /></button>
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="home-section" aria-labelledby="home-workboard">
        <div className="home-section-heading">
          <h2 id="home-workboard"><Icon name="layout-dashboard" size={16} /> Workboard</h2>
          <button type="button" className="btn btn-sm btn-tertiary" onClick={onOpenWorkboard}>Open Workboard <Icon name="arrow-right" size={14} /></button>
        </div>
        <div className="board-summary">
          {columns.map(column => (
            <button key={column.id} type="button" className="board-summary-item" onClick={() => onOpenBoardView(column.id)}>
              <span className="board-summary-count">{TASKS[column.id].length}</span>
              <span>{column.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
