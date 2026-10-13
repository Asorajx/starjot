import { Icon } from '../components/Icon';
import type { NotesSort } from '../app/preferences';
import { categoryName, getNote, noteTitle, setPinned, updatedLabel } from './store';
import type { NoteMenu } from './NoteMenu';
import type { Note } from '../../shared/types/note';

type OpenNote = (id: string) => void;
type OpenMenu = NoteMenu['onContextMenu'];


/* =========================
   Note Labels
   ========================= */

/* "Edited 5 min ago". Sample notes already store a full "Edited …" label, so it is not repeated. */
export function editedText(note: Note) {
  const label = updatedLabel(note);
  return /^edited/i.test(label) ? label : `Edited ${label.toLowerCase()}`;
}

/* Newest first, by the time each note was last edited. */
export function newestFirst(notes: Note[]) {
  return [...notes].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
}

/* Starred notes, newest first. */
export function starredNotes(notes: Note[]) {
  return newestFirst(notes).filter(note => note.pinned);
}

/* Sort a list by last edited, last opened (never-opened notes go last) or title from A to Z. */
export function sortNotes(notes: Note[], sort: NotesSort) {
  if (sort === 'title') {
    return [...notes].sort((a, b) => noteTitle(a).localeCompare(noteTitle(b), undefined, { sensitivity: 'base', numeric: true }));
  }
  if (sort === 'opened') return [...notes].sort((a, b) => (b.openedAt ?? '').localeCompare(a.openedAt ?? ''));
  return newestFirst(notes);
}

/* "Opened 5 min ago", or "Not opened yet" for notes that have never been opened here. */
export function openedLabel(note: Note) {
  if (!note.openedAt) return 'Not opened yet';
  return updatedLabel({ ...note, updatedAt: note.openedAt });
}


/* =========================
   Note Cards and Rows
   ========================= */

/* Marks a sub-note in a list with the note it sits in, so it is not mistaken for a top-level note. */
function SubpageTag({ note }: { note: Note }) {
  const parent = getNote(note.parentId);
  if (!parent) return null;
  const label = `In ‘${noteTitle(parent)}’`;
  return <span className="note-subpage-tag" title={label}>{label}</span>;
}

/* A small lock beside a locked note's title. Unlocked notes show nothing, which is the usual case. */
function LockedMark({ note }: { note: Note }) {
  if (!note.locked) return null;
  return <span className="note-locked-mark" role="img" aria-label="Locked" data-tooltip="Locked"><Icon name="lock" size={13} /></span>;
}

/* A note card: icon, title, description, category and edit time. */
export function NoteTile({ note, onOpen, onMenu }: { note: Note; onOpen: OpenNote; onMenu?: OpenMenu }) {
  const category = categoryName(note.category);
  return (
    <button type="button" className="note-tile" onClick={() => onOpen(note.id)} onContextMenu={onMenu && (event => onMenu(event, note.id))}>
      <span className="note-tile-title">
        {note.icon ? <span className="note-tile-icon" aria-hidden="true">{note.icon}</span> : <Icon name="file-text" size={16} />}
        <strong>{noteTitle(note)}</strong>
        <LockedMark note={note} />
      </span>
      <SubpageTag note={note} />
      <span className="note-tile-text">{note.subtitle || note.preview || 'No content yet.'}</span>
      <span className="note-tile-meta">{category && <>{category} · </>}{updatedLabel(note)}</span>
    </button>
  );
}

/* One row of a note list. The star adds or removes the note from Starred without opening it. */
function NoteRow({ note, onOpen, onMenu, time }: { note: Note; onOpen: OpenNote; onMenu?: OpenMenu; time: string }) {
  return (
    <div className="recent-row note-row" onContextMenu={onMenu && (event => onMenu(event, note.id))}>
      <button type="button" className="note-row-open" onClick={() => onOpen(note.id)}>
        <span className="recent-name">
          {note.icon && <span className="note-row-icon" aria-hidden="true">{note.icon}</span>}
          <span className="recent-text">
            <span className="note-row-title"><strong>{noteTitle(note)}</strong><LockedMark note={note} /><SubpageTag note={note} /></span>
            <small>{note.subtitle || note.preview}</small>
          </span>
        </span>
        <span className="recent-category">{categoryName(note.category)}</span>
        <span className="recent-time">{time}</span>
      </button>
      <button
        type="button"
        className={`note-pin ${note.pinned ? 'is-pinned' : ''}`}
        aria-label={note.pinned ? `Unstar ${note.title || 'note'}` : `Star ${note.title || 'note'}`}
        aria-pressed={note.pinned}
        onClick={() => setPinned(note.id, !note.pinned)}
      >
        <Icon name="star" size={15} />
      </button>
    </div>
  );
}

type NoteTableProps = {
  notes: Note[];
  onOpen: OpenNote;

  /* Right-clicking a row opens the note menu (see NoteMenu.tsx). */
  onMenu?: OpenMenu;

  /* Sorting by "Last opened" shows when each note was opened instead of when it was edited. */
  showOpened?: boolean;
};

/* A table of notes with Name, Category and Last edited (or Last opened) columns. */
export function NoteTable({ notes, onOpen, onMenu, showOpened = false }: NoteTableProps) {
  return (
    <div className="recent-table">
      <div className="recent-columns note-row-columns">
        <span>NAME</span><span>CATEGORY</span><span>{showOpened ? 'LAST OPENED' : 'LAST EDITED'}</span><span />
      </div>
      {notes.length
        ? notes.map(note => <NoteRow key={note.id} note={note} onOpen={onOpen} onMenu={onMenu} time={showOpened ? openedLabel(note) : updatedLabel(note)} />)
        : <p className="notes-empty-list">No notes here yet.</p>}
    </div>
  );
}
