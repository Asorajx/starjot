import { getNote } from '../store';
import { EditorSession } from './session';


/* =========================
   Kept Sessions
   ========================= */

/* A tab's editor is taken off the page while another tab is shown, but its session (undo */
/* history, caret and scroll) is kept here, so coming back to the tab carries on where it was. */
/* Sessions are kept per tab and note: two tabs showing one note each have their own, as before. */
/* Only the most recently used are kept; a closed tab's stay among them, so reopening it */
/* (Ctrl + Shift + T) keeps its undo too. */
const KEPT = 20;
const sessions = new Map<string, EditorSession>();

/* The session for a note in a tab: the kept one, or a new one. A kept session first takes in */
/* any change made to the note while it was away (another pane, an import), as one undo step, */
/* and its caret is put back when the editor shows the note again. */
export function sessionFor(tabId: string, noteId: string) {
  const key = `${tabId}:${noteId}`;
  let session = sessions.get(key);
  if (session) {
    sessions.delete(key);
    session.catchUp();
    session.pendingCaret = session.view.caret;
    session.revealCaret = false;
  } else {
    session = new EditorSession(noteId, getNote(noteId)?.content ?? '');
  }
  sessions.set(key, session);
  for (const oldest of sessions.keys()) {
    if (sessions.size <= KEPT) break;
    sessions.delete(oldest);
  }
  return session;
}
