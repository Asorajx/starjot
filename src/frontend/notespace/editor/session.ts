import { useSyncExternalStore } from 'react';
import { getNote, scheduleSave, subscribe, updateNote } from '../store';
import { cleanHtml } from '../sanitize';
import { markRange, newCommentId, unmark } from './comments/comments';
import { History, TypingSteps, type HistoryEntry } from './history';
import { charBesideCaret } from './text/dom';
import { getOffset } from './text/caret';
import { typeAfterLink } from './links/links';
import type { StickyState } from './text/blockModel';
import type { DrawingLayerInfo, DrawingStroke } from '../../../shared/types/note';

/* Each editor (continuous or structured) registers these actions with the session. */
export type EditorAdapter = {
  /* Read the current document from the page and save it. */
  commit: () => void;
  toggleSticky: () => void;

  /* wholeNote skips Block mode's first step of selecting the current block, for a block that */
  /* already had its own first step (such as a tab). */
  selectAll: (wholeNote?: boolean) => void;

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

  /* A caret position to restore the next time the editor renders the document, and whether */
  /* putting it back should scroll it into view (after undo, yes; coming back to a tab, no: the */
  /* tab's own scroll position is restored instead). */
  pendingCaret: number | null = null;
  revealCaret = true;

  /* Where the caret and the scroll were, kept while the tab is not shown (see sessions.ts). */
  view: { caret: number | null; scroll: number } = { caret: null, scroll: 0 };

  private history: History;
  private typing = new TypingSteps();
  private adapter: EditorAdapter | null = null;
  private bodyElement: HTMLElement | null = null;

  /* On a canvas, the editor shows one text box: this puts the box's lines back into the whole */
  /* note's content before saving. Null in a document, whose editor shows all of it. */
  private frame: ((inner: string) => string) | null = null;
  private listeners = new Set<() => void>();
  private snapshot: SessionSnapshot = { canUndo: false, canRedo: false, sticky: 'none', revision: 0, layout: 0 };

  constructor(noteId: string, content: string) {
    this.noteId = noteId;
    const note = getNote(noteId);
    this.history = new History(content, note?.comments ?? [], note?.drawing ?? [], note?.drawingLayers ?? []);
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

  /* The editor registers its editable area here. A split tab can show two notes (or the same note */
  /* twice), so each editor and its toolbars look up their own area instead of one id on the page. */
  setBody(element: HTMLElement | null) {
    this.bodyElement = element;
  }

  body() {
    return this.bodyElement;
  }

  setFrame(frame: ((inner: string) => string) | null) {
    this.frame = frame;
  }

  /* The scrolling area of the pane that shows this note. */
  scroller() {
    return this.bodyElement?.closest<HTMLElement>('.main-scroll') ?? null;
  }

  /* Another pane can show the same note. When the note's content or drawing is changed there, */
  /* this editor shows the new content as well (as one more undo step), so neither pane saves over the other's */
  /* edits. Showing it waits for a short pause in typing, but pressing or typing in this editor */
  /* takes it in at once (see catchUpHere), so this pane never edits an older copy. Returns a */
  /* function that stops watching. */
  watch() {
    let timer: number | undefined;
    const check = () => {
      if (!this.changedElsewhere()) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => this.catchUp(), 300);
    };
    const stop = subscribe(check);

    /* A key pressed in an editor showing an older copy is not typed: the editor is drawn again */
    /* with the newer text, the caret where it was, and the next key types into it. */
    const pressed = (event: Event) => {
      if (!(event.target instanceof Node) || !this.bodyElement?.contains(event.target)) return;
      if (this.catchUpHere() && event.type === 'keydown') event.preventDefault();
    };
    document.addEventListener('pointerdown', pressed, true);
    document.addEventListener('keydown', pressed, true);
    return () => {
      stop();
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', pressed, true);
      document.removeEventListener('keydown', pressed, true);
    };
  }

  /* Take in a change made elsewhere right away, before this editor is edited, keeping the caret */
  /* where it is. Returns whether there was one. */
  catchUpHere() {
    if (!this.changedElsewhere()) return false;
    const caret = getOffset(this.body());
    this.catchUp();
    this.pendingCaret = caret;
    this.revealCaret = false;
    return true;
  }

  /* Whether the note was changed outside this editor since its last undo step. */
  private changedElsewhere() {
    const note = getNote(this.noteId);
    return Boolean(note) && (note?.content !== this.history.currentContent() || note?.drawing !== this.history.currentDrawing()
      || note?.drawingLayers !== this.history.currentLayers());
  }

  /* Take in a change made elsewhere (another pane, or while this tab was not shown) as one more */
  /* undo step, and show it. */
  catchUp() {
    const note = getNote(this.noteId);
    if (!note || !this.changedElsewhere()) return;
    this.history.checkpoint();
    this.history.record(note.content, null, note.comments, note.drawing, note.drawingLayers);
    this.pendingCaret = null;
    this.view.caret = null;
    this.typing.reset();
    this.update({ revision: this.snapshot.revision + 1 });
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
  /* The content is cleaned first, so editor-only classes never create extra undo steps. The */
  /* note's drawing goes into the same step, so anchoring a drawing into the text (which changes */
  /* both) is undone in one go. An edit made on an older copy of the note (changed meanwhile in */
  /* another pane, or by deleting a sub-note) is not saved over the newer one: the editor takes */
  /* in the newer text instead. */
  save(content: string, caret: number | null = getOffset(this.body())) {
    if (this.catchUpHere()) return;
    const clean = cleanHtml(this.frame ? this.frame(content) : content);
    const note = updateNote(this.noteId, { content: clean }, false);
    scheduleSave();
    this.history.record(clean, caret, note?.comments ?? [], note?.drawing, note?.drawingLayers);
    this.typing.afterInput(caret);
    this.update({ layout: this.snapshot.layout + 1 });
  }

  /* Replace the whole note's content as one undo step, from outside the editor (moving or */
  /* removing a canvas's text box). */
  replaceContent(content: string) {
    const clean = cleanHtml(content);
    const note = updateNote(this.noteId, { content: clean }, false);
    if (!note) return;
    scheduleSave();
    this.history.checkpoint();
    this.history.record(clean, null, note.comments, note.drawing, note.drawingLayers);
    this.typing.reset();
    this.update({ layout: this.snapshot.layout + 1 });
  }

  /* Save a new drawing (after a stroke is drawn or erased), and new layers when they changed, as */
  /* one undo step. */
  saveDrawing(drawing: DrawingStroke[], drawingLayers?: DrawingLayerInfo[]) {
    const note = updateNote(this.noteId, drawingLayers ? { drawing, drawingLayers } : { drawing }, false);
    if (!note) return;
    scheduleSave();
    this.history.checkpoint();
    this.history.record(note.content, this.history.currentCaret(), note.comments, note.drawing, note.drawingLayers);
    this.typing.reset();
    this.update({});
  }

  updateCaret() {
    this.history.updateCaret(getOffset(this.body()));
  }

  /* Undo and redo on an older copy first take in the newer text, and undo nothing that time. */
  undo() {
    if (this.catchUpHere()) return;
    this.restore(this.history.undo());
  }

  redo() {
    if (this.catchUpHere()) return;
    this.restore(this.history.redo());
  }

  private restore(entry: HistoryEntry | null) {
    if (!entry) return;
    updateNote(this.noteId, { content: entry.content, comments: entry.comments, drawing: entry.drawing, drawingLayers: entry.layers }, false);
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

  selectAll(wholeNote = false) {
    this.adapter?.selectAll(wholeNote);
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
