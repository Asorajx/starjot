import { useState } from 'react';
import { EmojiPicker } from '../../components/EmojiPicker';
import { Icon } from '../../components/Icon';
import { scheduleSave, updateNote, useCategories, useNotes } from '../store';
import type { Note } from '../../../shared/types/note';

type NoteHeaderProps = {
  note: Note;
  locked: boolean;
  onOpenNote: (id: string) => void;
};

function formatDate(iso: string | null) {
  if (!iso) return 'Unknown';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/* Every page inside a page, at any depth (only one level today, but older notes may have more). */
function countPages(notes: Note[], parentId: string): number {
  return notes.filter(note => note.parentId === parentId).reduce((total, note) => total + 1 + countPages(notes, note.id), 0);
}

type PageListProps = {
  notes: Note[];
  parentId: string;
  onOpenNote: (id: string) => void;
};

/* The sub-pages of a page, oldest first (the order they were added), each with its own sub-pages */
/* listed below it. Hovering one shows a preview. */
function PageList({ notes, parentId, onOpenNote }: PageListProps) {
  const pages = notes.filter(note => note.parentId === parentId).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  if (!pages.length) return null;
  return (
    <ul className="note-page-list">
      {pages.map(page => (
        <li key={page.id}>
          <button type="button" className="note-page-link" data-preview-page={page.id} onClick={() => onOpenNote(page.id)}>
            {page.icon ? <span className="note-page-icon" aria-hidden="true">{page.icon}</span> : <Icon name="file-text" size={13} />}
            <span className="note-page-title">{page.title || 'Untitled note'}</span>
          </button>
          <PageList notes={notes} parentId={page.id} onOpenNote={onOpenNote} />
        </li>
      ))}
    </ul>
  );
}


/* =========================
   Note Header
   ========================= */

/* The top of a note: its icon, title and details (category, description, dates, comments, sub-pages). */
/* Details can be hidden per note; they can only be edited while the note is unlocked. */
export function NoteHeader({ note, locked, onOpenNote }: NoteHeaderProps) {
  const categories = useCategories();
  const notes = useNotes();
  const pageCount = countPages(notes, note.id);
  const [picking, setPicking] = useState(false);

  /* Text fields save after a short pause, like typing in the note itself. */
  const changeText = (changes: Partial<Pick<Note, 'title' | 'subtitle'>>) => {
    updateNote(note.id, changes, false);
    scheduleSave();
  };

  /* Only comments whose words are still in the note are counted. */
  const comments = note.comments.filter(comment => note.content.includes(`data-comment="${comment.id}"`)).length;

  const pick = (icon: string) => {
    updateNote(note.id, { icon });
    setPicking(false);
  };

  return (
    <div className="note-header">
      {note.icon && (
        <button type="button" className="note-icon" aria-label="Change icon" disabled={locked} onClick={() => setPicking(true)}>
          {note.icon}
        </button>
      )}

      <div className="note-header-actions">
        {!note.icon && !locked && (
          <button type="button" className="note-header-action" onClick={() => setPicking(true)}>
            <Icon name="sparkles" size={14} /> Add icon
          </button>
        )}

        <button type="button" className="note-header-action" aria-expanded={!note.detailsHidden} onClick={() => updateNote(note.id, { detailsHidden: !note.detailsHidden })}>
          <Icon name={note.detailsHidden ? 'list' : 'x'} size={14} /> {note.detailsHidden ? 'Show details' : 'Hide details'}
        </button>
      </div>

      {picking && (
        <EmojiPicker
          current={note.icon}
          onPick={pick}
          onRemove={() => pick('')}
          onClose={() => setPicking(false)}
        />
      )}

      <input
        id="note-title"
        className="note-title-input"
        type="text"
        aria-label="Note title"
        maxLength={160}
        placeholder="Untitled note"
        autoComplete="off"
        readOnly={locked}
        value={note.title}
        onChange={event => changeText({ title: event.target.value })}
      />

      {!note.detailsHidden && (
        <dl className="note-details">
          <dt>Category</dt>
          <dd>
            <select
              className="note-detail-field"
              aria-label="Category"
              disabled={locked}
              value={note.category}
              onChange={event => updateNote(note.id, { category: event.target.value })}
            >
              <option value="">None</option>
              {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </dd>

          <dt>Description</dt>
          <dd>
            <input
              className="note-detail-field"
              type="text"
              aria-label="Description"
              maxLength={250}
              placeholder={locked ? 'No description' : 'Add a description'}
              readOnly={locked}
              value={note.subtitle}
              onChange={event => changeText({ subtitle: event.target.value })}
            />
          </dd>

          <dt>Created</dt>
          <dd>{formatDate(note.createdAt)}</dd>

          <dt>Comments</dt>
          <dd>{comments || 'None'}</dd>

          {/* The page list can be folded on its own, so the other details stay visible. */}
          <dt className="note-pages-label">Pages</dt>
          <dd className="note-pages">
            {pageCount ? (
              <>
                <button
                  type="button"
                  className="note-pages-toggle"
                  aria-expanded={!note.pagesHidden}
                  onClick={() => updateNote(note.id, { pagesHidden: !note.pagesHidden })}
                >
                  <Icon name="chevron-right" size={13} className={note.pagesHidden ? '' : 'is-turned'} />
                  {pageCount} {pageCount === 1 ? 'page' : 'pages'}
                </button>
                {!note.pagesHidden && <PageList notes={notes} parentId={note.id} onOpenNote={onOpenNote} />}
              </>
            ) : 'None'}
          </dd>
        </dl>
      )}
    </div>
  );
}
