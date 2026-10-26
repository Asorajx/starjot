import { useSyncExternalStore } from 'react';
import { showToast } from '../lib/toasts';
import { childrenOf, deleteNote, getNote, noteTitle, restoreFromTrash } from './store';


/* =========================
   Moving to Trash
   ========================= */

/* Deleting asks first only when the note has sub-notes that could go with it (see */
/* DeleteNoteDialog); anything else goes straight to Trash, where it can be restored. */
export function asksBeforeDeleting(id: string) {
  return childrenOf(id).some(child => !child.locked);
}

/* Move a note to Trash, with a message offering to restore it straight away. */
export function moveToTrash(id: string, withSubNotes = false) {
  const title = noteTitle(getNote(id));
  const entryId = deleteNote(id, withSubNotes);
  if (!entryId) return;
  showToast({ kind: 'info', icon: 'trash', title: 'Moved to Trash', description: title, action: { label: 'Restore', run: () => restore(entryId) } });
}

export function restore(entryId: string) {
  const id = restoreFromTrash(entryId);
  if (id) showToast({ kind: 'success', title: 'Restored', description: noteTitle(getNote(id)) });
}


/* =========================
   Trash Popup
   ========================= */

/* Whether the Trash popup is open, and the button it opened from (it opens above that button, or */
/* in the middle of the screen when there is none, as from Settings on a phone). */
type TrashPopupState = { open: false } | { open: true; from: DOMRect | null };

let popup: TrashPopupState = { open: false };
const listeners = new Set<() => void>();

function change(next: TrashPopupState) {
  popup = next;
  listeners.forEach(listener => listener());
}

export function openTrash(from: DOMRect | null = null) {
  change({ open: true, from });
}

export function closeTrash() {
  if (popup.open) change({ open: false });
}

export function toggleTrash(from: DOMRect | null = null) {
  if (popup.open) closeTrash();
  else openTrash(from);
}

export function useTrashPopup() {
  return useSyncExternalStore(listener => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, () => popup);
}
