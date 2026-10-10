import { useState } from 'react';
import { EmojiPicker } from '../../components/EmojiPicker';
import { Icon } from '../../components/Icon';
import { scheduleSave, updateNote, useCategories } from '../store';
import type { Note } from '../../../shared/types/note';

type NoteHeaderProps = {
  note: Note;
  locked: boolean;
};

function formatDate(iso: string | null) {
  if (!iso) return 'Unknown';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}


/* =========================
   Note Header
   ========================= */

/* The top of a note: its icon, title and details (category, description, dates, comments). */
/* Details can be hidden per note; they can only be edited while the note is unlocked. */
export function NoteHeader({ note, locked }: NoteHeaderProps) {
  const categories = useCategories();
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
              <option value="">No category</option>
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
        </dl>
      )}
    </div>
  );
}
