import { useState, type MouseEvent, type ReactNode } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { useDismiss } from '../lib/useDismiss';
import { childrenOf, deleteNote, getNote } from './store';


/* =========================
   Note Menu
   ========================= */

export type NoteMenuActions = {
  onOpen: (id: string) => void;
  onOpenInNewTab: (id: string) => void;
};

/* What a list of notes needs to show the menu: call onContextMenu from a note's right-click, and */
/* show menu somewhere on the screen. */
export type NoteMenu = {
  onContextMenu: (event: MouseEvent, id: string) => void;
  menu: ReactNode;
};

/* The right-click menu of a note in a list: open it here or in a new tab, or delete it (after */
/* asking). A locked note cannot be deleted until it is unlocked, as inside the note. */
export function useNoteMenu({ onOpen, onOpenInNewTab }: NoteMenuActions): NoteMenu {
  const [open, setOpen] = useState<{ id: string; top: number; left: number } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  useDismiss(Boolean(open), '.note-menu', () => setOpen(null));

  function onContextMenu(event: MouseEvent, id: string) {
    event.preventDefault();

    /* The keyboard's menu key has no pointer position, so the menu opens under the note instead. */
    const fromKeyboard = event.clientX === 0 && event.clientY === 0;
    const box = (event.currentTarget as Element).getBoundingClientRect();
    setOpen({ id, top: fromKeyboard ? box.bottom : event.clientY, left: fromKeyboard ? box.left : event.clientX });
  }

  function run(action: (id: string) => void) {
    if (!open) return;
    setOpen(null);
    action(open.id);
  }

  function confirmDelete() {
    if (deleting) deleteNote(deleting);
    setDeleting(null);
  }

  const note = open ? getNote(open.id) : undefined;
  const deletingNote = deleting ? getNote(deleting) : undefined;
  const nested = deleting ? childrenOf(deleting).length : 0;

  const menu = (
    <>
      {open && note && (
        <div
          className="page-menu note-menu"
          role="menu"
          aria-label={`${note.title || 'Untitled note'} options`}
          style={{ top: Math.min(open.top, window.innerHeight - 120), left: Math.min(open.left, window.innerWidth - 200) }}
        >
          <button type="button" role="menuitem" className="page-menu-item" autoFocus onClick={() => run(onOpen)}>
            <Icon name="arrow-right" size={14} /> Open
          </button>
          <button type="button" role="menuitem" className="page-menu-item" onClick={() => run(onOpenInNewTab)}>
            <Icon name="external-link" size={14} /> Open in new tab
          </button>
          <button
            type="button"
            role="menuitem"
            className="page-menu-item is-danger"
            disabled={note.locked}
            data-tooltip={note.locked ? 'Unlock the note to delete it.' : undefined}
            data-tooltip-align="start"
            onClick={() => run(setDeleting)}
          >
            <Icon name="trash" size={14} /> Delete note
          </button>
        </div>
      )}

      {deleting && (
        <ConfirmDialog title="Delete this note?" confirmLabel="Delete note" danger onConfirm={confirmDelete} onCancel={() => setDeleting(null)}>
          <p><strong>{deletingNote?.title || 'Untitled note'}</strong> will be removed from this browser. This cannot be undone.</p>
          {nested > 0 && <p>Its {nested} sub-note(s) will be kept and move up one level.</p>}
        </ConfirmDialog>
      )}
    </>
  );

  return { onContextMenu, menu };
}
