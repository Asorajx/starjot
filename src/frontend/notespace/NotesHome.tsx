import { useEffect, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { updatePreferences, usePreferences, type NotesSort } from '../app/preferences';
import { editedText, newestFirst, NoteTable, NoteTile, sortNotes } from './NoteList';
import {
  addCategory, canAddCategory, categoryName, removeCategory, renameCategory, useCategories, useNotes
} from './store';
import type { Category, Note } from '../../shared/types/note';

/* The filter can be "all notes" or one category id. */
export type NoteFilter = 'all' | string;

type NotesHomeProps = {
  filter: NoteFilter;
  onFilterChange: (filter: NoteFilter) => void;
  onOpen: (id: string) => void;
  onOpenCategory: (id: string) => void;
  onCreate: () => void;
};

type HomeTab = 'starred' | 'recent' | 'categories';

/* How many notes the Starred and Recent tabs show. */
const TAB_COUNT = 6;

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
   Category Filters
   ========================= */

type CategoryBarProps = {
  notes: Note[];
  filter: NoteFilter;
  onFilterChange: (filter: NoteFilter) => void;
};

/* Filter chips for each category, shown when the Filter button is opened. */
function CategoryBar({ notes, filter, onFilterChange }: CategoryBarProps) {
  const categories = useCategories();
  const count = (id: string) => notes.filter(note => note.category === id).length;

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
      {categories.map(category => chip(category.id, category.name, count(category.id)))}
    </div>
  );
}


/* =========================
   Category Editor
   ========================= */

type CategoryEditorProps = {
  notes: Note[];
  filter: NoteFilter;
  onFilterChange: (filter: NoteFilter) => void;
};

/* Shown in the Categories tab after pressing Edit categories: rename, remove or add categories. */
function CategoryEditor({ notes, filter, onFilterChange }: CategoryEditorProps) {
  const categories = useCategories();
  const [removing, setRemoving] = useState<Category | null>(null);
  const count = (id: string) => notes.filter(note => note.category === id).length;

  /* A new category starts with a placeholder name, ready to be renamed. */
  function add() {
    let number = categories.length + 1;
    while (categories.some(category => category.name === `Category ${number}`)) number += 1;
    addCategory(`Category ${number}`);
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

  return (
    <div className="category-editor" role="group" aria-label="Edit categories">
      {categories.map(category => (
        <span key={category.id} className="category-edit">
          <Icon name="folder" size={14} />
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
      ))}

      <button type="button" className="btn btn-sm btn-secondary" disabled={!canAddCategory()} onClick={add}>
        <Icon name="plus" size={13} /> {canAddCategory() ? 'Add category' : '5 of 5 used'}
      </button>

      {removing && (
        <ConfirmDialog title={`Remove "${removing.name}"?`} confirmLabel="Remove category" danger onConfirm={confirmRemove} onCancel={() => setRemoving(null)}>
          <p>The {count(removing.id)} {count(removing.id) === 1 ? 'note' : 'notes'} in this category will be kept, without a category.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}


/* =========================
   Category Cards
   ========================= */

type CategoryCardProps = {
  id: string;
  name: string;
  notes: Note[];
  onOpenCategory: (id: string) => void;
};

/* A card for one category: its name, how many notes it has, and its latest three notes. */
function CategoryCard({ id, name, notes, onOpenCategory }: CategoryCardProps) {
  return (
    <button type="button" className="note-tile category-card" onClick={() => onOpenCategory(id)}>
      <span className="note-tile-title">
        <Icon name="folder" size={16} />
        <strong>{name}</strong>
        <span className="category-count">{notes.length}</span>
      </span>
      <span className="category-card-notes">
        {notes.length
          ? notes.slice(0, 3).map(note => <span key={note.id}>{note.icon ? `${note.icon} ` : ''}{note.title || 'Untitled note'}</span>)
          : <span className="category-card-empty">No notes yet</span>}
      </span>
    </button>
  );
}


/* =========================
   Notespace Home
   ========================= */

export function NotesHome({ filter, onFilterChange, onOpen, onOpenCategory, onCreate }: NotesHomeProps) {
  const notes = useNotes();
  const now = useNow();
  const { notesSort } = usePreferences();
  const [showFilters, setShowFilters] = useState(filter !== 'all');
  const [editingCategories, setEditingCategories] = useState(false);

  /* Re-render when categories are renamed, so each row shows the current name. */
  const categories = useCategories();

  const newest = newestFirst(notes);
  const starred = newest.filter(note => note.pinned);
  const lastEdited = newest[0];
  const shown = sortNotes(notes.filter(note => filter === 'all' || note.category === filter), notesSort);
  const filterLabel = filter === 'all' ? 'All notes' : categoryName(filter);

  /* Starred opens first when there are starred notes; otherwise Recent. */
  const [tab, setTab] = useState<HomeTab>(starred.length ? 'starred' : 'recent');
  const tabNotes = (tab === 'starred' ? starred : newest).slice(0, TAB_COUNT);

  const tabButton = (id: HomeTab, label: string, icon: 'star' | 'clock' | 'folder', count?: number) => (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      aria-selected={tab === id}
      aria-controls="home-tab-panel"
      className={`home-tab ${tab === id ? 'is-active' : ''}`}
      onClick={() => {
        setTab(id);
        if (id !== 'categories') setEditingCategories(false);
      }}
    >
      <Icon name={icon} size={14} /> {label} {count !== undefined && <span className="category-count">{count}</span>}
    </button>
  );

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
        <div className="home-tabs-header">
          <div className="home-tabs" role="tablist" aria-label="Starred notes, recent notes and categories">
            {tabButton('starred', 'Starred', 'star', starred.length)}
            {tabButton('recent', 'Recent', 'clock')}
            {tabButton('categories', 'Categories', 'folder', categories.length)}
          </div>

          {/* Editing happens in the Categories tab, so the button switches to it. */}
          <button
            type="button"
            className="btn btn-sm btn-tertiary home-tabs-action"
            aria-pressed={editingCategories}
            onClick={() => {
              setTab('categories');
              setEditingCategories(value => !value);
            }}
          >
            {editingCategories ? 'Done' : <><Icon name="sliders-horizontal" size={14} /> Edit categories</>}
          </button>
        </div>
        <div className="note-tiles" id="home-tab-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {tab === 'categories' && editingCategories && <CategoryEditor notes={notes} filter={filter} onFilterChange={onFilterChange} />}
          {tab === 'categories' && !editingCategories && (
            categories.map(category => (
              <CategoryCard key={category.id} id={category.id} name={category.name} notes={newest.filter(note => note.category === category.id)} onOpenCategory={onOpenCategory} />
            ))
          )}
          {tab !== 'categories' && (tabNotes.length
            ? tabNotes.map(note => <NoteTile key={note.id} note={note} onOpen={onOpen} />)
            : <p className="notes-empty-list">Star a note with the ☆ in the list below to keep it here.</p>)}
        </div>
      </section>

      <section className="all-notes" aria-label="All notes">
        <div className="all-notes-heading">
          <h2>All notes <span className="category-count">{notes.length}</span></h2>
          <label className="notes-sort">
            <span>Sort by</span>
            <select value={notesSort} aria-label="Sort all notes by" onChange={event => updatePreferences({ notesSort: event.target.value as NotesSort })}>
              <option value="edited">Last edited</option>
              <option value="opened">Last opened</option>
              <option value="title">Name (A–Z)</option>
            </select>
          </label>
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

        <NoteTable notes={shown} onOpen={onOpen} showOpened={notesSort === 'opened'} />
      </section>
    </div>
  );
}
