import { useSyncExternalStore } from 'react';
import { getNote, scheduleSave, updateNote } from '../store';
import { cleanHtml } from '../sanitize';
import { markRange, newCommentId, unmark } from './comments';
import { History, TypingSteps, type HistoryEntry } from './history';
import { charBesideCaret } from './dom';
import { getOffset } from './caret';
import { typeAfterLink } from './links';
import type { StickyState } from './blockModel';

/* Each editor (continuous or structured) registers these actions with the session. */
export type EditorAdapter = {
  /* Read the current document from the page and save it. */
  commit: () => void;
  toggleSticky: () => void;
  selectAll: () => void;

  /* Lines were added or replaced (by a slash command, a toggle or a table); save them and */
  /* put the caret in focus. Structured mode also splits the new lines into their own blocks. */
  linesChanged: (focus: HTMLElement | null, atEnd: boolean) => void;
};

export type SessionSnapshot = {
  canUndo: boolean;
  canRedo: boolean;
  sticky: StickyState;

  /* Increases when the document is replaced (undo/redo), so the editor re-renders it. */
  revision: number;

  /* Increases when the layout may have moved, so code language pickers re-measure. */
  layout: number;
};


/* =========================
   Editor Session
   ========================= */

/* One session exists per open note. It connects the editor to undo history, saving and the toolbar. */
export class EditorSession {
  readonly noteId: string;

  /* A caret position to restore the next time the editor renders the document. */
  pendingCaret: number | null = null;

  private history: History;
  private typing = new TypingSteps();
  private adapter: EditorAdapter | null = null;
  private listeners = new Set<() => void>();
  private snapshot: SessionSnapshot = { canUndo: false, canRedo: false, sticky: 'none', revision: 0, layout: 0 };

  constructor(noteId: string, content: string) {
    this.noteId = noteId;
    this.history = new History(content, getNote(noteId)?.comments ?? []);
  }

  /* React subscribes with useSyncExternalStore; each change creates a new snapshot object. */
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = () => this.snapshot;

  private update(changes: Partial<SessionSnapshot>) {
    const next = {
      ...this.snapshot,
      canUndo: this.history.canUndo(),
      canRedo: this.history.canRedo(),
      ...changes
    };
    const changed = (Object.keys(next) as (keyof SessionSnapshot)[]).some(key => next[key] !== this.snapshot[key]);
    if (!changed) return;
    this.snapshot = next;
    this.listeners.forEach(listener => listener());
  }

  setAdapter(adapter: EditorAdapter | null) {
    this.adapter = adapter;
  }

  body() {
    return document.getElementById('note-body');
  }

  /* Called from the native beforeinput event, before the browser changes the text. */
  beforeInput(event: InputEvent) {
    const selection = window.getSelection();
    const caret = getOffset(this.body());
    const deleted = event.inputType === 'deleteContentForward' ? charBesideCaret('after') : charBesideCaret('before');
    if (this.typing.startsNewStep(event.inputType, event.data, caret, selection?.isCollapsed ?? true, deleted)) {
      this.history.checkpoint(caret);
    }

    /* Text typed after a link is added outside the link by hand, so the browser's input event */
    /* does not happen and the change is saved here. */
    if (typeAfterLink(event)) this.adapter?.commit();
  }

  /* Call before structural edits (new block, merge, Sticky, paste) so they become their own step. */
  checkpoint() {
    this.history.checkpoint(getOffset(this.body()));
    this.typing.reset();
  }

  /* Save new document content and add it to the undo history. */
  /* The content is cleaned first, so editor-only classes never create extra undo steps. */
  save(content: string, caret: number | null = getOffset(this.body())) {
    const clean = cleanHtml(content);
    updateNote(this.noteId, { content: clean }, false);
    scheduleSave();
    this.history.record(clean, caret, getNote(this.noteId)?.comments ?? []);
    this.typing.afterInput(caret);
    this.update({ layout: this.snapshot.layout + 1 });
  }

  updateCaret() {
    this.history.updateCaret(getOffset(this.body()));
  }

  undo() {
    this.restore(this.history.undo());
  }

  redo() {
    this.restore(this.history.redo());
  }

  private restore(entry: HistoryEntry | null) {
    if (!entry) return;
    updateNote(this.noteId, { content: entry.content, comments: entry.comments }, false);
    scheduleSave();
    this.pendingCaret = entry.caret;
    this.typing.reset();
    this.update({ revision: this.snapshot.revision + 1 });
  }

  setSticky(sticky: StickyState) {
    this.update({ sticky });
  }

  toggleSticky() {
    this.adapter?.toggleSticky();
  }

  selectAll() {
    this.adapter?.selectAll();
  }

  /* Save after a change made outside the editor, such as choosing a code language. */
  commit() {
    this.adapter?.commit();
  }

  linesChanged(focus: HTMLElement | null, atEnd = false) {
    this.adapter?.linesChanged(focus, atEnd);
  }

  /* Mark the selected text (or a whole table) and store the comment. Works on locked notes too. */
  addComment(target: Range | HTMLElement, text: string) {
    const note = getNote(this.noteId);
    const id = newCommentId();
    if (!note || !text.trim()) return;
    this.checkpoint();
    if (target instanceof HTMLElement) target.dataset.comment = id;
    else if (!markRange(target, id)) return;
    updateNote(this.noteId, { comments: [...note.comments, { id, text: text.trim(), createdAt: new Date().toISOString() }] }, false);
    this.commit();
  }

  removeComment(id: string) {
    const note = getNote(this.noteId);
    const body = this.body();
    if (!note || !body) return;
    this.checkpoint();
    unmark(body, id);
    updateNote(this.noteId, { comments: note.comments.filter(comment => comment.id !== id) }, false);
    this.commit();
  }

  relayout() {
    this.update({ layout: this.snapshot.layout + 1 });
  }
}

/* Read one value from the session; the component only re-renders when that value changes. */
export function useSessionValue<T>(session: EditorSession, select: (snapshot: SessionSnapshot) => T) {
  return useSyncExternalStore(session.subscribe, () => select(session.getSnapshot()));
}
