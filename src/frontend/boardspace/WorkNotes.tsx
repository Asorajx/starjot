import { useMemo, useState, type KeyboardEvent } from 'react';
import { Icon } from '../components/Icon';
import { useEscape } from '../lib/useDismiss';
import { createNote, noteIcon, noteTitle, updateNote, useNotes } from '../notespace/store';
import type { Note } from '../../shared/types/note';
import type { WorkItem } from '../../shared/types/board';
import { linkNote, unlinkNote } from './board';

/* How many matching notes the picker lists at once. */
const PICKER_LIMIT = 8;


/* =========================
   Linked Notes
   ========================= */

/* The notes linked to a work item that still exist (a deleted note quietly drops out). */
export function linkedNotes(item: WorkItem, notes: Note[]) {
  const ids = new Set(item.notes ?? []);
  return notes.filter(note => ids.has(note.id));
}

/* A small count of linked notes, for the List and the Board. */
export function NoteCount({ count }: { count: number }) {
  if (!count) return null;
  const label = `${count} linked ${count === 1 ? 'note' : 'notes'}`;
  return <span className="work-note-count" data-tooltip={label} aria-label={label} role="img"><Icon name="file-text" size={12} />{count}</span>;
}

type WorkNotesProps = {
  item: WorkItem;

  /* Saves the editor's fields and closes it, before a note opens; false when the fields cannot */
  /* be saved yet (the editor then shows why, and nothing opens). */
  onLeave: () => boolean;

  /* Opens a note in a new tab. */
  onOpenNote: (noteId: string) => void;
};

/* The Notes section of the work item editor: the linked notes (each opens in a new tab, or is */
/* unlinked with ×), Link a note (finds a note by its title) and New note (makes a note named */
/* after the item, links it and opens it). Links change at once, like status and assignee. */
export function WorkNotes({ item, onLeave, onOpenNote }: WorkNotesProps) {
  const notes = useNotes();
  const linked = linkedNotes(item, notes);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');

  /* The match Enter links, moved with the arrow keys and marked in the list. */
  const [active, setActive] = useState(0);

  /* While the search is open, Escape closes it rather than the whole editor (the latest */
  /* Escape handler goes first). */
  useEscape(picking, () => setPicking(false));

  /* Notes not linked yet whose title holds the typed words, most recently edited first. */
  const matches = useMemo(() => {
    const words = query.trim().toLowerCase();
    const ids = new Set(item.notes ?? []);
    return notes
      .filter(note => !ids.has(note.id) && noteTitle(note).toLowerCase().includes(words))
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
      .slice(0, PICKER_LIMIT);
  }, [notes, query, item.notes]);

  function choose(note: Note) {
    linkNote(item.id, note.id);
    setPicking(false);
    setQuery('');
  }

  function open(noteId: string) {
    if (onLeave()) onOpenNote(noteId);
  }

  function createAndOpen() {
    if (!onLeave()) return;
    const note = createNote();
    updateNote(note.id, { title: item.name });
    linkNote(item.id, note.id);
    onOpenNote(note.id);
  }

  /* ↑ and ↓ move through the matches and Enter links the marked one. */
  function pickerKeys(event: KeyboardEvent) {
    const shown = Math.min(active, matches.length - 1);
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && matches.length) {
      event.preventDefault();
      setActive((shown + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
    } else if (event.key === 'Enter' && matches[shown]) {
      event.preventDefault();
      choose(matches[shown]);
    }
  }

  return (
    <div className="board-field">
      <span>Notes</span>
      {linked.length > 0 ? (
        <ul className="work-notes">
          {linked.map(note => (
            <li key={note.id}>
              <span className="work-notes-icon" aria-hidden="true">{note.icon || <Icon name={noteIcon(note)} size={15} />}</span>
              <button type="button" className="work-notes-open" onClick={() => open(note.id)}>{noteTitle(note)}</button>
              <button type="button" className="work-notes-remove" aria-label={`Unlink ${noteTitle(note)}`} data-tooltip="Unlink" data-tooltip-align="end" onClick={() => unlinkNote(item.id, note.id)}>
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : <small className="board-field-hint">No linked notes. A linked note opens in a new tab.</small>}

      {picking ? (
        <div className="work-notes-picker">
          <label className="board-field">
            <span>Find a note</span>
            <input
              className="board-input"
              autoFocus
              placeholder="Type part of its title"
              value={query}
              role="combobox"
              aria-expanded={matches.length > 0}
              aria-controls="work-notes-matches"
              aria-activedescendant={matches.length ? `work-notes-match-${Math.min(active, matches.length - 1)}` : undefined}
              onChange={event => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={pickerKeys}
            />
          </label>
          {matches.length ? (
            <ul className="work-notes-matches" id="work-notes-matches" role="listbox" aria-label="Matching notes">
              {matches.map((note, index) => (
                <li key={note.id} role="presentation">
                  <button
                    type="button"
                    id={`work-notes-match-${index}`}
                    role="option"
                    aria-selected={index === Math.min(active, matches.length - 1)}
                    className={`work-notes-match ${index === Math.min(active, matches.length - 1) ? 'is-active' : ''}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(note)}
                  >
                    <span className="work-notes-icon" aria-hidden="true">{note.icon || <Icon name={noteIcon(note)} size={15} />}</span>
                    {noteTitle(note)}
                  </button>
                </li>
              ))}
            </ul>
          ) : <small className="board-field-hint">{query.trim() ? 'No note has that in its title.' : 'Every note is linked already.'}</small>}
          <div className="work-notes-actions">
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPicking(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="work-notes-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPicking(true)}><Icon name="link" size={14} /> Link a note</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={createAndOpen}><Icon name="plus" size={14} /> New note</button>
        </div>
      )}
    </div>
  );
}
