import { useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Dropdown, type DropdownOption } from '../components/Dropdown';
import { Icon } from '../components/Icon';
import { useDismiss } from '../lib/useDismiss';
import { useFocusTrap } from '../lib/useFocusTrap';
import { ancestorsOf, categoryName, deleteForever, emptyTrash, getNote, noteIcon, noteTitle, TRASH_DAYS, useCategories, useNotes, useTrash } from './store';
import { closeTrash, restore, useTrashPopup } from './trash';
import type { TrashEntry } from '../../shared/types/note';

/* "Today", "Yesterday" or "3 days ago": when a note went to Trash. */
function deletedLabel(deletedAt: string) {
  const days = Math.floor((Date.now() - Date.parse(deletedAt)) / (24 * 60 * 60 * 1000));
  if (days < 1) return 'Today';
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}

/* Where the note was: its category, then the notes it sat in (those that still exist). */
function pathOf(entry: TrashEntry) {
  const [note] = entry.notes;
  const parent = getNote(note.parentId);
  const above = parent ? [...ancestorsOf(parent.id), parent].map(item => noteTitle(item)) : [];
  return [categoryName(note.category), ...above].filter(Boolean).join(' / ');
}


/* =========================
   Trash Popup
   ========================= */

/* Notes moved to Trash, newest first, in a popup above the sidebar's Trash button: search them */
/* or keep to one category (In), restore one, or delete one (or all) permanently, which asks */
/* first. A deletion that took sub-notes with it is one row, restored or deleted together. */
export function TrashPopup() {
  const popup = useTrashPopup();
  return popup.open ? <TrashWindow from={popup.from} /> : null;
}

function TrashWindow({ from }: { from: DOMRect | null }) {
  const trash = useTrash();

  /* Paths name the notes that are there now, so they follow renames and restores. */
  useNotes();
  const categories = useCategories();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [deleting, setDeleting] = useState<TrashEntry | null>(null);
  const [emptying, setEmptying] = useState(false);
  useDismiss(!deleting && !emptying, '.trash-popup, .trash-button', closeTrash);

  /* Like a dialog, the keyboard stays in it (also over Settings, which can open it). */
  const popupRef = useRef<HTMLDivElement>(null);
  useFocusTrap(popupRef, null);

  const words = query.trim().toLowerCase();
  const inScope = (entry: TrashEntry) => scope === 'all' || entry.notes[0].category === (scope === 'none' ? '' : scope);
  const shown = trash.filter(entry => inScope(entry) && (!words || `${noteTitle(entry.notes[0])} ${pathOf(entry)}`.toLowerCase().includes(words)));
  const scopeOptions: DropdownOption<string>[] = [
    { value: 'all', label: 'Everything', icon: 'trash' },
    { value: 'none', label: 'No category', icon: 'book-open' },
    ...categories.map((category, at) => ({ value: category.id, label: category.name, icon: 'folder' as const, heading: at === 0 ? 'Categories' : undefined }))
  ];
  const place = from
    ? { left: Math.max(8, from.left), bottom: Math.max(8, window.innerHeight - from.top + 8) }
    : undefined;

  return (
    <>
      <div ref={popupRef} className={`trash-popup ${from ? '' : 'is-centered'}`} style={place} role="dialog" aria-label="Trash">
        <input
          className="trash-search"
          type="search"
          aria-label="Search notes in Trash"
          placeholder="Search notes in Trash"
          autoFocus
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
        <div className="trash-filters">
          <Dropdown
            label="Trash in"
            prefix="In"
            className={`search-filter ${scope !== 'all' ? 'is-active' : ''}`}
            value={scope}
            options={scopeOptions}
            onChange={setScope}
          />
        </div>
        <ul className="trash-list">
          {shown.map(entry => {
            const [note] = entry.notes;
            const path = pathOf(entry);
            const more = entry.notes.length - 1;
            return (
              <li key={entry.id} className="trash-row">
                <span className="trash-icon" aria-hidden="true">{note.icon || <Icon name={noteIcon(note)} size={16} />}</span>
                <span className="trash-text">
                  <strong>{noteTitle(note)}</strong>
                  <small>
                    {[path, more ? `with ${more} sub-note${more === 1 ? '' : 's'}` : '', deletedLabel(entry.deletedAt)].filter(Boolean).join(' · ')}
                  </small>
                </span>
                {/* The labels show to the left, so they never stretch the scrolling list. */}
                <button type="button" className="trash-action" aria-label={`Restore ${noteTitle(note)}`} data-tooltip="Restore" data-tooltip-side="left" onClick={() => restore(entry.id)}>
                  <Icon name="undo" size={16} />
                </button>
                <button type="button" className="trash-action" aria-label={`Delete ${noteTitle(note)} permanently`} data-tooltip="Delete permanently" data-tooltip-side="left" onClick={() => setDeleting(entry)}>
                  <Icon name="trash" size={16} />
                </button>
              </li>
            );
          })}
        </ul>
        {!shown.length && (
          <p className="trash-empty">
            {!trash.length ? 'Trash is empty. Deleted notes stay here for a while, so they can be restored.' : words ? `Nothing in Trash matches “${query.trim()}”.` : 'Nothing in Trash is in here.'}
          </p>
        )}
        <div className="trash-footer">
          <span>Notes in Trash for {TRASH_DAYS} days are deleted automatically.</span>
          <button type="button" className="btn btn-sm btn-quiet" disabled={!trash.length} onClick={() => setEmptying(true)}>Empty Trash</button>
        </div>
      </div>

      {deleting && (
        <ConfirmDialog
          title="Delete permanently?"
          confirmLabel="Delete permanently"
          danger
          onConfirm={() => {
            deleteForever(deleting.id);
            setDeleting(null);
          }}
          onCancel={() => setDeleting(null)}
        >
          <p><strong>{noteTitle(deleting.notes[0])}</strong>{deleting.notes.length > 1 ? ' and the sub-notes deleted with it' : ''} will be deleted permanently, with everything written in it. This cannot be undone.</p>
        </ConfirmDialog>
      )}
      {emptying && (
        <ConfirmDialog
          title="Empty Trash?"
          confirmLabel="Empty Trash"
          danger
          onConfirm={() => {
            emptyTrash();
            setEmptying(false);
          }}
          onCancel={() => setEmptying(false)}
        >
          <p>Every note in Trash ({trash.length === 1 ? '1 deletion' : `${trash.length} deletions`}) will be deleted permanently. This cannot be undone.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
