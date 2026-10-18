import { useState, type MouseEvent, type ReactNode } from 'react';
import { DeleteNoteDialog } from './DeleteNoteDialog';
import { Icon } from '../components/Icon';
import { useDismiss } from '../lib/useDismiss';
import { TitleEditor } from '../components/TitleEditor';
import { NoteColorPicker } from './NoteColors';
import { deleteNote, getNote, noteTitle, updateNote } from './store';


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

/* The right-click menu of a note in a list: open it here or in a new tab, rename it (on the row or */
/* card itself), or delete it */
/* (after asking). A locked note cannot be renamed or deleted until it is unlocked, as inside the note. */
export function useNoteMenu({ onOpen, onOpenInNewTab }: NoteMenuActions): NoteMenu {
  /* title: the note's title in the row or card right-clicked, which Rename edits in place. */
  const [open, setOpen] = useState<{ id: string; top: number; left: number; title: HTMLElement | null } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; title: HTMLElement } | null>(null);
  useDismiss(Boolean(open), '.note-menu', () => setOpen(null));

  function onContextMenu(event: MouseEvent, id: string) {
    event.preventDefault();

    /* The keyboard's menu key has no pointer position, so the menu opens under the note instead. */
    const fromKeyboard = event.clientX === 0 && event.clientY === 0;
    const target = event.currentTarget as Element;
    const box = target.getBoundingClientRect();
    const title = target.querySelector<HTMLElement>('.note-row-title strong, .note-tile-title strong');
    setOpen({ id, top: fromKeyboard ? box.bottom : event.clientY, left: fromKeyboard ? box.left : event.clientX, title });
  }

  function run(action: (id: string) => void) {
    if (!open) return;
    setOpen(null);
    action(open.id);
  }

  function confirmDelete(withSubNotes: boolean) {
    if (deleting) deleteNote(deleting, withSubNotes);
    setDeleting(null);
  }

  const note = open ? getNote(open.id) : undefined;

  const menu = (
    <>
      {open && note && (
        <div
          className="page-menu note-menu"
          role="menu"
          aria-label={`${noteTitle(note)} options`}
          style={{ top: Math.min(open.top, window.innerHeight - 220), left: Math.min(open.left, window.innerWidth - 240) }}
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
            className="page-menu-item"
            disabled={note.locked || !open.title}
            data-tooltip={note.locked ? 'Unlock the note to rename it.' : undefined}
            data-tooltip-align="start"
            onClick={() => {
              setOpen(null);
              if (open.title) setRenaming({ id: open.id, title: open.title });
            }}
          >
            <Icon name="pencil" size={14} /> Rename
          </button>
          <div className="note-menu-colors">
            <span>Colour</span>
            <NoteColorPicker noteId={note.id} color={note.color} />
          </div>
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

      {renaming && (
        <TitleEditor
          anchor={renaming.title}
          value={getNote(renaming.id)?.title ?? ''}
          onSave={title => updateNote(renaming.id, { title })}
          onClose={() => setRenaming(null)}
        />
      )}

      {deleting && <DeleteNoteDialog noteId={deleting} onConfirm={confirmDelete} onCancel={() => setDeleting(null)} />}
    </>
  );

  return { onContextMenu, menu };
}
