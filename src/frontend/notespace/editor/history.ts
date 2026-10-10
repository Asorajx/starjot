/* =========================
   Undo History
   ========================= */

export type HistoryEntry = {
  content: string;
  caret: number | null;
};

const LIMIT = 300;

/* Stores whole-note snapshots. A checkpoint marks where the next undo step begins. */
export class History {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private current: HistoryEntry;
  private startNewStep = true;

  constructor(content: string) {
    this.current = { content, caret: null };
  }

  /* Call before an edit that should become its own step; the caret is where undo returns to. */
  checkpoint(caret: number | null = null) {
    this.startNewStep = true;
    if (caret !== null) this.current.caret = caret;
  }

  /* Call after every edit with the new content. Returns false when nothing changed. */
  record(content: string, caret: number | null) {
    if (content === this.current.content) {
      this.current.caret = caret ?? this.current.caret;
      return false;
    }
    if (this.startNewStep) {
      this.undoStack.push(this.current);
      if (this.undoStack.length > LIMIT) this.undoStack.shift();
      this.startNewStep = false;
    }
    this.current = { content, caret };
    this.redoStack = [];
    return true;
  }

  /* Keep the caret of the current state up to date after structural edits. */
  updateCaret(caret: number | null) {
    if (caret !== null) this.current.caret = caret;
  }

  undo() {
    const previous = this.undoStack.pop();
    if (!previous) return null;
    this.redoStack.push(this.current);
    this.current = previous;
    this.startNewStep = true;
    return previous;
  }

  redo() {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(this.current);
    this.current = next;
    this.startNewStep = true;
    return next;
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }
}


/* =========================
   Typing Steps
   ========================= */

type TypingKind = 'insert' | 'delete' | 'other';

const PAUSE = 1500;

function isSpace(character: string) {
  return /\s/.test(character);
}

/* Decides when typing should start a new undo step, so each step is about one word. */
/* A new step starts when: the kind of edit changes, the caret jumps, typing pauses, */
/* or a new word begins after a space (typing) or a space is reached (deleting). */
export class TypingSteps {
  private kind: TypingKind = 'other';
  private lastTime = 0;
  private lastCaret: number | null = null;
  private lastCharacter = '';

  /* Returns true when the edit about to happen should begin a new undo step. */
  startsNewStep(inputType: string, data: string | null, caret: number | null, collapsed: boolean, deletedCharacter: string) {
    const kind: TypingKind = inputType === 'insertText' ? 'insert'
      : inputType === 'deleteContentBackward' || inputType === 'deleteContentForward' ? 'delete'
        : 'other';
    const character = kind === 'insert' ? (data ?? '').slice(-1) : deletedCharacter;
    const now = Date.now();

    let newStep = kind === 'other' || kind !== this.kind || !collapsed || now - this.lastTime > PAUSE
      || caret === null || caret !== this.lastCaret;
    if (!newStep && kind === 'insert') newStep = isSpace(this.lastCharacter) && !isSpace(character);
    if (!newStep && kind === 'delete') newStep = !isSpace(this.lastCharacter) && isSpace(character);

    this.kind = kind;
    this.lastTime = now;
    this.lastCharacter = character;
    return newStep;
  }

  /* Remember where the caret ended up, so the next key press can tell if it moved. */
  afterInput(caret: number | null) {
    this.lastCaret = caret;
  }

  /* After undo, paste or a structural change, the next typing always starts fresh. */
  reset() {
    this.kind = 'other';
    this.lastCaret = null;
  }
}
