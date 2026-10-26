import { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { childrenOf, getNote, noteTitle, TRASH_DAYS } from './store';

type DeleteNoteDialogProps = {
  noteId: string;

  /* Called "sub-note" in the window when it is deleted from the note it sits in. */
  sub?: boolean;

  /* Move the note to Trash, and its sub-notes too when withSubNotes is true. */
  onConfirm: (withSubNotes: boolean) => void;
  onCancel: () => void;
};

const plural = (count: number) => `${count} sub-note${count === 1 ? '' : 's'}`;


/* =========================
   Delete Note Dialog
   ========================= */

/* Shown before moving a note with sub-notes to Trash (see asksBeforeDeleting), to choose whether */
/* they go too or stay and move up one level. Locked sub-notes always stay. A note without */
/* sub-notes goes to Trash without asking, as it can be restored from there. */
export function DeleteNoteDialog({ noteId, sub = false, onConfirm, onCancel }: DeleteNoteDialogProps) {
  const [withSubNotes, setWithSubNotes] = useState(false);
  const title = noteTitle(getNote(noteId));
  const children = childrenOf(noteId);
  const deletable = children.filter(child => !child.locked);

  return (
    <ConfirmDialog
      title={sub ? 'Move this sub-note to Trash?' : 'Move this note to Trash?'}
      confirmLabel="Move to Trash"
      danger
      onConfirm={() => onConfirm(withSubNotes)}
      onCancel={onCancel}
    >
      <p><strong>{title}</strong> can be restored from Trash for {TRASH_DAYS} days.</p>
      {!withSubNotes && <p>Its {plural(children.length)} will be kept and move up one level.</p>}
      {withSubNotes && deletable.length < children.length && <p>Locked sub-notes are kept, and move up one level.</p>}
      <label className="dialog-check">
        <input type="checkbox" checked={withSubNotes} onChange={event => setWithSubNotes(event.target.checked)} />
        Also move its {plural(deletable.length)} to Trash
      </label>
    </ConfirmDialog>
  );
}
