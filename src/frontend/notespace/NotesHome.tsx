import { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Dropdown } from '../components/Dropdown';
import { Icon } from '../components/Icon';
import { updatePreferences, usePreferences, type NotesSort } from '../app/preferences';
import { newestFirst, NoteTable, NoteTile, sortNotes } from './NoteList';
import { useNoteMenu } from './NoteMenu';
import { useImport } from './import/useImport';
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
  onOpenInNewTab: (id: string) => void;
  onOpenCategory: (id: string) => void;
  onCreate: () => void;
};

/* How many starred notes show before "Show all". */
const STARRED_COUNT = 6;


/* =========================
   Category Filters
   ========================= */

type CategoryBarProps = {
  notes: Note[];
  filter: NoteFilter;
  onFilterChange: (filter: NoteFilter) => void;
  onOpenCategory: (id: string) => void;
};

/* One pill per category filters All notes; Edit categories swaps the pills for name fields. */
function CategoryBar({ notes, filter, onFilterChange, onOpenCategory }: CategoryBarProps) {
  const categories = useCategories();
  const [editing, setEditing] = useState(false);
  const count = (id: string) => notes.filter(note => note.category === id).length;

  const chip = (value: NoteFilter, label: string, total: number) => (
    <button
      key={value}
      type="button"
      className={`category-filter ${filter === value ? 'is-active' : ''}`}
      aria-pressed={filter === value}
      onClick={() => onFilterChange(value)}
    >
      {value !== 'all' && <Icon name="folder" size={13} />}{label} <span className="category-count">{total}</span>
    </button>
  );

  return (
    <div className="category-bar">
      {editing
        ? <CategoryEditor notes={notes} filter={filter} onFilterChange={onFilterChange} />
        : (
          <div className="category-filters" role="toolbar" aria-label="Filter notes by category">
            {chip('all', 'All', notes.length)}
            {categories.map(category => chip(category.id, category.name, count(category.id)))}
            {filter !== 'all' && (
              <button type="button" className="btn btn-sm btn-tertiary" onClick={() => onOpenCategory(filter)}>
                Open {categoryName(filter)} <Icon name="arrow-right" size={14} />
              </button>
            )}
          </div>
        )}
      <button type="button" className="btn btn-sm btn-tertiary category-bar-action" aria-pressed={editing} onClick={() => setEditing(value => !value)}>
        {editing ? 'Done' : <><Icon name="sliders-horizontal" size={14} /> Edit categories</>}
      </button>
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

/* Shown after pressing Edit categories: rename, remove or add categories. */
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
   Notespace Home
   ========================= */

export function NotesHome({ filter, onFilterChange, onOpen, onOpenInNewTab, onOpenCategory, onCreate }: NotesHomeProps) {
  const notes = useNotes();
  const noteMenu = useNoteMenu({ onOpen, onOpenInNewTab });
  const importer = useImport(onOpen);
  const { notesSort } = usePreferences();
  const [showAllStarred, setShowAllStarred] = useState(false);

  /* Re-render when categories are renamed, so each row shows the current name. */
  const categories = useCategories();

  const starred = newestFirst(notes).filter(note => note.pinned);
  const starredShown = showAllStarred ? starred : starred.slice(0, STARRED_COUNT);
  const shown = sortNotes(notes.filter(note => filter === 'all' || note.category === filter), notesSort);

  return (
    <div className="content-pad notes-home" {...importer.dropProps}>
      <header className="page-intro">
        <div>
          <h1>Notespace</h1>
          <p>
            {notes.length} {notes.length === 1 ? 'note' : 'notes'} in {categories.length} {categories.length === 1 ? 'category' : 'categories'}
          </p>
        </div>
        <div className="notes-home-actions">
          <button
            className="btn btn-secondary"
            type="button"
            disabled={importer.busy}
            data-tooltip="Make new notes from Markdown, HTML, PDF, CSV or text files. You can also drop files here."
            data-tooltip-wrap=""
            onClick={importer.choose}
          >
            <Icon name="upload" size={16} /><span>{importer.busy ? 'Importing…' : 'Import'}</span>
          </button>
          <button className="btn btn-primary" type="button" onClick={onCreate}><Icon name="plus" size={16} /><span>New note</span></button>
        </div>
      </header>

      <section className="home-section" aria-labelledby="starred-heading">
        <div className="home-section-heading">
          <h2 id="starred-heading"><Icon name="star" size={16} /> Starred <span className="category-count">{starred.length}</span></h2>
          {starred.length > STARRED_COUNT && (
            <button type="button" className="btn btn-sm btn-tertiary" aria-expanded={showAllStarred} onClick={() => setShowAllStarred(value => !value)}>
              {showAllStarred ? 'Show fewer' : `Show all ${starred.length}`}
            </button>
          )}
        </div>
        {starred.length
          ? <div className="note-tiles">{starredShown.map(note => <NoteTile key={note.id} note={note} onOpen={onOpen} onMenu={noteMenu.onContextMenu} />)}</div>
          : <p className="home-hint">Star a note with the ☆ in the list below to keep it here.</p>}
      </section>

      <section className="home-section" aria-labelledby="all-notes-heading">
        <div className="home-section-heading">
          <h2 id="all-notes-heading"><Icon name="file-text" size={16} /> All notes <span className="category-count">{notes.length}</span></h2>
          <div className="notes-sort">
            <span aria-hidden="true">Sort by</span>
            <Dropdown<NotesSort>
              label="Sort all notes by"
              value={notesSort}
              alignEnd
              options={[
                { value: 'edited', label: 'Last edited', icon: 'pencil' },
                { value: 'opened', label: 'Last opened', icon: 'clock' },
                { value: 'title', label: 'Name (A–Z)', icon: 'type' }
              ]}
              onChange={sort => updatePreferences({ notesSort: sort })}
            />
          </div>
        </div>

        <CategoryBar notes={notes} filter={filter} onFilterChange={onFilterChange} onOpenCategory={onOpenCategory} />

        <NoteTable notes={shown} onOpen={onOpen} onMenu={noteMenu.onContextMenu} showOpened={notesSort === 'opened'} />
      </section>

      {noteMenu.menu}
      {importer.elements}
    </div>
  );
}
