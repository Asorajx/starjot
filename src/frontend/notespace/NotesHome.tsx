import { useEffect, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import {
  addCategory, canAddCategory, categoryName, removeCategory, renameCategory, setPinned, updatedLabel, useCategories, useNotes
} from './store';
import type { Category, Note } from '../../shared/types/note';

/* The filter can be "all notes", one category id, or notes without a category. */
export type NoteFilter = 'all' | 'none' | string;

type NotesHomeProps = {
  filter: NoteFilter;
  onFilterChange: (filter: NoteFilter) => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
};

/* How many notes the Starred and Recent tabs show. */
const TAB_COUNT = 6;

function greeting(now: Date) {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/* "Edited 5 min ago". Sample notes already store a full "Edited …" label, so it is not repeated. */
function editedText(note: Note) {
  const label = updatedLabel(note);
  return /^edited/i.test(label) ? label : `Edited ${label.toLowerCase()}`;
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
   Category Filters
   ========================= */

type CategoryBarProps = {
  notes: Note[];
  filter: NoteFilter;
  onFilterChange: (filter: NoteFilter) => void;
};

/* Filter chips for each category. In edit mode the chips become name fields with a remove button. */
function CategoryBar({ notes, filter, onFilterChange }: CategoryBarProps) {
  const categories = useCategories();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState<Category | null>(null);
  const count = (id: string) => notes.filter(note => note.category === id).length;
  const uncategorised = count('');

  /* A new category starts with a placeholder name and is opened for renaming straight away. */
  function add() {
    let number = categories.length + 1;
    while (categories.some(category => category.name === `Category ${number}`)) number += 1;
    if (addCategory(`Category ${number}`)) setEditing(true);
  }

  /* An empty or duplicate name puts the old name back. */
  function rename(category: Category, input: HTMLInputElement) {
    if (!renameCategory(category.id, input.value)) input.value = category.name;
  }

  function confirmRemove() {
    if (!removing) return;
    if (filter === removing.id) onFilterChange('all');
    removeCategory(removing.id);
    setRemoving(null);
  }

  const chip = (value: NoteFilter, label: string, total: number) => (
    <button
      key={value}
      type="button"
      className={`category-filter ${filter === value ? 'is-active' : ''}`}
      aria-pressed={filter === value}
      onClick={() => onFilterChange(value)}
    >
      {label} <span className="category-count">{total}</span>
    </button>
  );

  return (
    <div className="category-bar" id="note-filters" role="toolbar" aria-label="Filter notes by category">
      {chip('all', 'All notes', notes.length)}

      {categories.map(category => (editing ? (
        <span key={category.id} className="category-edit">
          <input
            className="category-name-input"
            aria-label={`Rename ${category.name}`}
            maxLength={24}
            defaultValue={category.name}
            onBlur={event => rename(category, event.currentTarget)}
            onKeyDown={event => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
          <button type="button" className="category-remove" aria-label={`Remove ${category.name}`} onClick={() => setRemoving(category)}>
            <Icon name="x" size={13} />
          </button>
        </span>
      ) : chip(category.id, category.name, count(category.id))))}

      {uncategorised > 0 && !editing && chip('none', 'No category', uncategorised)}

      <span className="category-actions">
        {editing && (
          <button type="button" className="btn btn-sm btn-tertiary" disabled={!canAddCategory()} onClick={add}>
            <Icon name="plus" size={13} /> {canAddCategory() ? 'Add category' : '5 of 5 used'}
          </button>
        )}
        <button type="button" className="btn btn-sm btn-tertiary" aria-pressed={editing} onClick={() => setEditing(value => !value)}>
          {editing ? 'Done' : 'Edit categories'}
        </button>
      </span>

      {removing && (
        <ConfirmDialog title={`Remove "${removing.name}"?`} confirmLabel="Remove category" danger onConfirm={confirmRemove} onCancel={() => setRemoving(null)}>
          <p>The {count(removing.id)} {count(removing.id) === 1 ? 'note' : 'notes'} in this category will be kept, without a category.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}


/* =========================
   Note Lists
   ========================= */

/* A note card for the Starred and Recent tabs: icon, title, description, category and edit time. */
function NoteTile({ note, onOpen }: { note: Note; onOpen: (id: string) => void }) {
  const category = categoryName(note.category);
  return (
    <button type="button" className="note-tile" onClick={() => onOpen(note.id)}>
      <span className="note-tile-title">
        {note.icon ? <span className="note-tile-icon" aria-hidden="true">{note.icon}</span> : <Icon name="file-text" size={16} />}
        <strong>{note.title || 'Untitled note'}</strong>
      </span>
      <span className="note-tile-text">{note.subtitle || note.preview || 'No content yet.'}</span>
      <span className="note-tile-meta">{category && <>{category} · </>}{updatedLabel(note)}</span>
    </button>
  );
}

/* One row of the full list. The star adds or removes the note from Starred without opening it. */
function NoteRow({ note, onOpen }: { note: Note; onOpen: (id: string) => void }) {
  return (
    <div className="recent-row note-row">
      <button type="button" className="note-row-open" onClick={() => onOpen(note.id)}>
        <span className="recent-name">
          {note.icon && <span className="note-row-icon" aria-hidden="true">{note.icon}</span>}
          <span className="recent-text"><strong>{note.title || 'Untitled note'}</strong><small>{note.subtitle || note.preview}</small></span>
        </span>
        <span className="recent-category">{categoryName(note.category)}</span>
        <span className="recent-time">{updatedLabel(note)}</span>
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


/* =========================
   Notespace Home
   ========================= */

export function NotesHome({ filter, onFilterChange, onOpen, onCreate }: NotesHomeProps) {
  const notes = useNotes();
  const now = useNow();
  const [showFilters, setShowFilters] = useState(filter !== 'all');

  /* Re-render when categories are renamed, so each row shows the current name. */
  useCategories();

  const newest = [...notes].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  const starred = newest.filter(note => note.pinned);
  const lastEdited = newest[0];
  const shown = newest.filter(note => filter === 'all' || (filter === 'none' ? note.category === '' : note.category === filter));
  const filterLabel = filter === 'all' ? 'All notes' : filter === 'none' ? 'No category' : categoryName(filter);

  /* Starred opens first when there are starred notes; otherwise Recent. */
  const [tab, setTab] = useState<'starred' | 'recent'>(starred.length ? 'starred' : 'recent');
  const tabNotes = (tab === 'starred' ? starred : newest).slice(0, TAB_COUNT);

  return (
    <div className="content-pad notes-home">
      {/* Welcome panel: greeting and clock on the left, the last edited note on the right. */}
      <section className="home-hero" aria-label="Welcome">
        <div className="home-hero-intro">
          <p className="home-hero-time">
            {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} · {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </p>
          <h1>{greeting(now)}</h1>
          <p>Find your thoughts, pick up where you left off, and make room for the next idea.</p>
          <button className="btn btn-primary" type="button" onClick={onCreate}><Icon name="plus" size={16} /><span>New note</span></button>
        </div>

        {lastEdited && (
          <div className="home-resume">
            <span className="home-resume-label">Where you left off</span>
            <span className="note-tile-title">
              {lastEdited.icon ? <span className="note-tile-icon" aria-hidden="true">{lastEdited.icon}</span> : <Icon name="file-text" size={16} />}
              <strong>{lastEdited.title || 'Untitled note'}</strong>
            </span>
            <span className="note-tile-text">{lastEdited.subtitle || lastEdited.preview || 'No content yet.'}</span>
            <span className="home-resume-footer">
              <span className="note-tile-meta">{editedText(lastEdited)}</span>
              <button className="btn btn-sm btn-secondary" type="button" onClick={() => onOpen(lastEdited.id)}>Continue <Icon name="arrow-right" size={14} /></button>
            </span>
          </div>
        )}
      </section>

      <section className="home-tabs-panel">
        <div className="home-tabs" role="tablist" aria-label="Starred and recent notes">
          <button type="button" role="tab" id="tab-starred" aria-selected={tab === 'starred'} aria-controls="home-tab-panel" className={`home-tab ${tab === 'starred' ? 'is-active' : ''}`} onClick={() => setTab('starred')}>
            <Icon name="star" size={14} /> Starred <span className="category-count">{starred.length}</span>
          </button>
          <button type="button" role="tab" id="tab-recent" aria-selected={tab === 'recent'} aria-controls="home-tab-panel" className={`home-tab ${tab === 'recent' ? 'is-active' : ''}`} onClick={() => setTab('recent')}>
            <Icon name="clock" size={14} /> Recent
          </button>
        </div>
        <div className="note-tiles" id="home-tab-panel" role="tabpanel" aria-labelledby={tab === 'starred' ? 'tab-starred' : 'tab-recent'}>
          {tabNotes.length
            ? tabNotes.map(note => <NoteTile key={note.id} note={note} onOpen={onOpen} />)
            : <p className="notes-empty-list">Star a note with the ☆ in the list below to keep it here.</p>}
        </div>
      </section>

      <section className="all-notes" aria-label="All notes">
        <div className="all-notes-heading">
          <h2>All notes <span className="category-count">{notes.length}</span></h2>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            aria-expanded={showFilters}
            aria-controls="note-filters"
            onClick={() => setShowFilters(value => !value)}
          >
            <Icon name="sliders-horizontal" size={14} /> Filter{filter !== 'all' ? `: ${filterLabel}` : ''} <Icon name="chevron-down" size={14} className={showFilters ? 'is-flipped' : ''} />
          </button>
        </div>

        {showFilters && <CategoryBar notes={notes} filter={filter} onFilterChange={onFilterChange} />}

        <div className="recent-table">
          <div className="recent-columns note-row-columns"><span>NAME</span><span>CATEGORY</span><span>LAST EDITED</span><span /></div>
          {shown.length
            ? shown.map(note => <NoteRow key={note.id} note={note} onOpen={onOpen} />)
            : <p className="notes-empty-list">No notes here yet.</p>}
        </div>
      </section>
    </div>
  );
}
