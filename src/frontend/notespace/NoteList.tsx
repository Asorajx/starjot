import { useEffect, useRef, useState, type FocusEvent, type MouseEvent } from 'react';
import { Icon } from '../components/Icon';
import { opensNewTab, startNoteDrag, type OpenById } from '../lib/clicks';
import { useMediaQuery } from '../lib/useMediaQuery';
import { updatePreferences, usePreferences, type NotesSort } from '../app/preferences';
import { LinkPreviewCard } from './editor/links/LinkPreview';
import { NoteColorStrip } from './NoteColors';
import { categoryName, getNote, noteIcon, noteTitle, setPinned, updatedLabel } from './store';
import type { NoteMenu } from './NoteMenu';
import type { Note } from '../../shared/types/note';

type OpenNote = OpenById;
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

/* A small pill after a note's title saying what kind of note it is, so documents and canvases */
/* can be told apart at a glance (in words, not only by the icon). */
function KindPill({ note }: { note: Note }) {
  const canvas = note.kind === 'canvas';
  return <span className={`note-kind-pill ${canvas ? 'is-canvas' : 'is-document'}`}>{canvas ? 'Canvas' : 'Document'}</span>;
}

/* A small lock beside a locked note's title. Unlocked notes show nothing, which is the usual case. */
function LockedMark({ note }: { note: Note }) {
  if (!note.locked) return null;
  return <span className="note-locked-mark" role="img" aria-label="Locked" data-tooltip="Locked"><Icon name="lock" size={13} /></span>;
}

/* The star that adds or removes a note from Starred without opening it (not counted as an edit). */
export function StarButton({ note, className = '' }: { note: Note; className?: string }) {
  return (
    <button
      type="button"
      className={`note-pin ${className} ${note.pinned ? 'is-pinned' : ''}`}
      aria-label={note.pinned ? `Unstar ${note.title || 'note'}` : `Star ${note.title || 'note'}`}
      aria-pressed={note.pinned}
      onClick={() => setPinned(note.id, !note.pinned)}
    >
      <Icon name="star" size={15} />
    </button>
  );
}

type NoteTileProps = {
  note: Note;
  onOpen: OpenNote;
  onMenu?: OpenMenu;

  /* A gallery card: taller, with more of the note's text and a star of its own. */
  large?: boolean;
};

/* A note card: icon, title, description (or, as a gallery card, the start of the text), */
/* category and edit time, with the note's colour along its top. */
export function NoteTile({ note, onOpen, onMenu, large = false }: NoteTileProps) {
  const { noteColorsInLists } = usePreferences();
  const category = categoryName(note.category);
  const text = large ? note.preview || note.subtitle : note.subtitle || note.preview;
  return (
    <div className={`note-tile-wrap ${large ? 'is-large' : ''}`}>
      <button type="button" className="note-tile" draggable onDragStart={event => startNoteDrag(event, note.id)} onClick={event => onOpen(note.id, opensNewTab(event))} onContextMenu={onMenu && (event => onMenu(event, note.id))}>
        {noteColorsInLists && <NoteColorStrip color={note.color} />}
        <span className="note-tile-title">
          {note.icon ? <span className="note-tile-icon" aria-hidden="true">{note.icon}</span> : <Icon name={noteIcon(note)} size={16} />}
          <strong>{noteTitle(note)}</strong>
          <KindPill note={note} />
          <LockedMark note={note} />
        </span>
        <SubpageTag note={note} />
        <span className="note-tile-text">{text || 'No content yet.'}</span>
        <span className="note-tile-meta">{category && <>{category} · </>}{updatedLabel(note)}</span>
      </button>
      {large && <StarButton note={note} className="note-tile-pin" />}
    </div>
  );
}

/* One row of a note list, with the note's colour along its left edge. */
/* Rows and cards can be dragged onto the tab bar to open the note in a new tab. */
function NoteRow({ note, onOpen, onMenu, time }: { note: Note; onOpen: OpenNote; onMenu?: OpenMenu; time: string }) {
  const { noteColorsInLists } = usePreferences();
  return (
    <div className="recent-row note-row" data-note-row={note.id} draggable onDragStart={event => startNoteDrag(event, note.id)} onContextMenu={onMenu && (event => onMenu(event, note.id))}>
      {noteColorsInLists && <NoteColorStrip color={note.color} />}
      <button type="button" className="note-row-open" onClick={event => onOpen(note.id, opensNewTab(event))}>
        <span className="recent-name">
          {note.icon && <span className="note-row-icon" aria-hidden="true">{note.icon}</span>}
          <span className="recent-text">
            <span className="note-row-title"><strong>{noteTitle(note)}</strong><KindPill note={note} /><LockedMark note={note} /><SubpageTag note={note} /></span>
            <small>{note.subtitle || note.preview}</small>
          </span>
        </span>
        <span className="recent-category">{categoryName(note.category)}</span>
        <span className="recent-time">{time}</span>
      </button>
      <StarButton note={note} />
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

  /* Rows (the default), or a gallery of larger cards. */
  view?: 'list' | 'gallery';
};

/* Two buttons choosing how notes are listed, as rows or as a gallery of cards. The choice is */
/* remembered, and category pages use it too. */
export function NotesViewSwitch() {
  const { notesView } = usePreferences();
  const option = (value: 'list' | 'gallery', label: string, icon: 'list' | 'grid') => (
    <button
      type="button"
      role="radio"
      className={`notes-view-option ${notesView === value ? 'is-active' : ''}`}
      aria-checked={notesView === value}
      aria-label={label}
      data-tooltip={label}
      onClick={() => updatePreferences({ notesView: value })}
    >
      <Icon name={icon} size={15} />
    </button>
  );
  return (
    <div className="notes-view-switch" role="radiogroup" aria-label="Show notes as">
      {option('list', 'List', 'list')}
      {option('gallery', 'Gallery', 'grid')}
    </div>
  );
}

/* How long the pointer rests on a row before its preview opens, so moving across the list does */
/* not flash previews. */
const PREVIEW_DELAY = 500;

/* Reaching a row with the keyboard (Tab) shows its preview sooner: there is no passing over. */
const FOCUS_PREVIEW_DELAY = 300;

/* A table of notes with Name, Category and Last edited (or Last opened) columns, or a gallery of */
/* cards. Resting the mouse on a row, or reaching it with Tab, shows a preview of the note (cards */
/* already show it). */
export function NoteTable({ notes, onOpen, onMenu, showOpened = false, view = 'list' }: NoteTableProps) {
  const [preview, setPreview] = useState<{ id: string; top: number; left: number; above: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  /* The row the pointer is resting on, so moving within it does not start the wait again. */
  const hovered = useRef<string | null>(null);
  const canHover = useMediaQuery('(hover: hover)');

  useEffect(() => () => window.clearTimeout(timer.current), []);

  /* The preview opens under the row's title, or above it near the bottom of the window. */
  function showFor(row: HTMLElement | null, delay: number) {
    const id = row?.dataset.noteRow ?? null;
    if (id === hovered.current) return;
    hovered.current = id;
    window.clearTimeout(timer.current);
    setPreview(null);
    if (!row || !id) return;
    timer.current = window.setTimeout(() => {
      if (!row.isConnected) return;
      const title = row.querySelector('.recent-name')?.getBoundingClientRect() ?? row.getBoundingClientRect();
      const above = title.bottom + 220 > window.innerHeight && title.top > 220;
      setPreview({ id, top: above ? title.top - 4 : title.bottom + 4, left: Math.min(title.left, window.innerWidth - 316), above });
    }, delay);
  }

  function handleOver(event: MouseEvent) {
    const row = (event.target as Element).closest<HTMLElement>('[data-note-row]');
    showFor(canHover && !event.buttons ? row : null, PREVIEW_DELAY);
  }

  /* Only focus from the keyboard counts; a click focuses the row too, and opens the note anyway. */
  function handleFocus(event: FocusEvent) {
    const target = event.target as Element;
    if (target.matches(':focus-visible')) showFor(target.closest<HTMLElement>('[data-note-row]'), FOCUS_PREVIEW_DELAY);
  }

  function handleBlur(event: FocusEvent) {
    const next = event.relatedTarget as Element | null;
    if (!next?.closest('[data-note-row]')) hidePreview();
  }

  function hidePreview() {
    window.clearTimeout(timer.current);
    hovered.current = null;
    setPreview(null);
  }

  if (view === 'gallery') {
    return notes.length
      ? <div className="note-tiles is-gallery">{notes.map(note => <NoteTile key={note.id} note={note} onOpen={onOpen} onMenu={onMenu} large />)}</div>
      : <p className="notes-empty-list">No notes here yet.</p>;
  }

  return (
    <div className="recent-table" onMouseOver={handleOver} onMouseLeave={hidePreview} onMouseDown={hidePreview} onContextMenu={hidePreview} onFocus={handleFocus} onBlur={handleBlur}>
      <div className="recent-columns note-row-columns">
        <span>NAME</span><span>CATEGORY</span><span>{showOpened ? 'LAST OPENED' : 'LAST EDITED'}</span><span />
      </div>
      {notes.length
        ? notes.map(note => <NoteRow key={note.id} note={note} onOpen={onOpen} onMenu={onMenu} time={showOpened ? openedLabel(note) : updatedLabel(note)} />)
        : <p className="notes-empty-list">No notes here yet.</p>}
      {preview && (
        <div className="page-preview note-list-preview" role="tooltip" style={{ top: preview.top, left: preview.left, transform: preview.above ? 'translateY(-100%)' : undefined }}>
          <LinkPreviewCard target={{ kind: 'page', id: preview.id }} />
        </div>
      )}
    </div>
  );
}
