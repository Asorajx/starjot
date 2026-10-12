import { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { childrenOf, getNote } from './store';

type DeleteNoteDialogProps = {
  noteId: string;

  /* Called "sub-note" in the window when it is deleted from the note it sits in. */
  sub?: boolean;

  /* Delete the note, and its sub-notes too when withSubNotes is true. */
  onConfirm: (withSubNotes: boolean) => void;
  onCancel: () => void;
};

const plural = (count: number) => `${count} sub-note${count === 1 ? '' : 's'}`;


/* =========================
   Delete Note Dialog
   ========================= */

/* Asks before deleting a note. A note with sub-notes offers to delete them as well; choosing that */
/* asks once more, as it removes more than the one note. Locked sub-notes are always kept. */
export function DeleteNoteDialog({ noteId, sub = false, onConfirm, onCancel }: DeleteNoteDialogProps) {
  const [withSubNotes, setWithSubNotes] = useState(false);
  const [askingAgain, setAskingAgain] = useState(false);
  const title = getNote(noteId)?.title || 'Untitled note';
  const children = childrenOf(noteId);
  const deletable = children.filter(child => !child.locked);
  const lockedNote = deletable.length < children.length ? <p>Locked sub-notes are kept, and move up one level.</p> : null;

  if (askingAgain) {
    return (
      <ConfirmDialog title={`Also delete ${plural(deletable.length)}?`} confirmLabel="Delete all" danger onConfirm={() => onConfirm(true)} onCancel={() => setAskingAgain(false)}>
        <p><strong>{title}</strong> and {deletable.map(child => child.title || 'Untitled note').join(', ')} will be removed from this browser, with everything written in them. This cannot be undone.</p>
        {lockedNote}
      </ConfirmDialog>
    );
  }

  return (
    <ConfirmDialog
      title={sub ? 'Delete this sub-note?' : 'Delete this note?'}
      confirmLabel={sub ? 'Delete sub-note' : 'Delete note'}
      danger
      onConfirm={() => (withSubNotes ? setAskingAgain(true) : onConfirm(false))}
      onCancel={onCancel}
    >
      <p><strong>{title}</strong> will be removed from this browser. This cannot be undone.</p>
      {children.length > 0 && !withSubNotes && <p>Its {plural(children.length)} will be kept and move up one level.</p>}
      {withSubNotes && lockedNote}
      {deletable.length > 0 && (
        <label className="dialog-check">
          <input type="checkbox" checked={withSubNotes} onChange={event => setWithSubNotes(event.target.checked)} />
          Also delete its {plural(deletable.length)}
        </label>
      )}
    </ConfirmDialog>
  );
}
