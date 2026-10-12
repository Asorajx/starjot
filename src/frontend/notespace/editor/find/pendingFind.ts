/* =========================
   Find on Open
   ========================= */

/* Search opens a note that matched in its text, then the note's editor opens the find bar with */
/* those words, so the first match is shown straight away. Only the next note opened uses it. */
let pending: { noteId: string; words: string } | null = null;

export function findWhenOpened(noteId: string, words: string) {
  pending = words ? { noteId, words } : null;
}

/* The words to find in this note, once; null when there are none. */
export function takeFindForNote(noteId: string) {
  if (pending?.noteId !== noteId) return null;
  const { words } = pending;
  pending = null;
  return words;
}
