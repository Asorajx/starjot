import { describe, expect, it } from 'vitest';
import { History, TypingSteps } from '../../src/frontend/notespace/editor/history';


/* =========================
   Undo History
   ========================= */

describe('History', () => {
  it('undoes and redoes one step at a time', () => {
    const history = new History('a');
    history.checkpoint();
    history.record('ab', 2);
    history.checkpoint();
    history.record('abc', 3);

    expect(history.undo()?.content).toBe('ab');
    expect(history.undo()?.content).toBe('a');
    expect(history.undo()).toBeNull();
    expect(history.redo()?.content).toBe('ab');
  });

  it('merges edits into the current step until the next checkpoint', () => {
    const history = new History('');
    history.checkpoint();
    history.record('h', 1);
    history.record('hi', 2);
    expect(history.undo()?.content).toBe('');
  });

  it('clears redo steps after a new edit', () => {
    const history = new History('a');
    history.checkpoint();
    history.record('ab', 2);
    history.undo();
    history.checkpoint();
    history.record('ax', 2);
    expect(history.canRedo()).toBe(false);
  });
});


/* =========================
   Typing Steps
   ========================= */

describe('History with comments', () => {
  it('brings back the comments that went with each step', () => {
    const first = { id: 'c1', text: 'First', createdAt: '' };
    const history = new History('a', [first]);
    history.checkpoint();
    history.record('b', 1, []);

    expect(history.undo()?.comments).toEqual([first]);
    expect(history.redo()?.comments).toEqual([]);
  });
});

describe('TypingSteps', () => {
  /* Type characters one by one and return which ones started a new undo step. */
  function typeText(steps: TypingSteps, text: string) {
    return [...text].map((character, index) => {
      const startsStep = steps.startsNewStep('insertText', character, index, true, '');
      steps.afterInput(index + 1);
      return startsStep;
    });
  }

  it('starts a new undo step for each new word', () => {
    const started = typeText(new TypingSteps(), 'hi there');
    expect(started).toEqual([true, false, false, true, false, false, false, false]);
  });

  it('starts a new step when the caret jumps somewhere else', () => {
    const steps = new TypingSteps();
    steps.startsNewStep('insertText', 'a', 0, true, '');
    steps.afterInput(1);
    expect(steps.startsNewStep('insertText', 'b', 10, true, '')).toBe(true);
  });

  it('starts a new step when switching from typing to deleting', () => {
    const steps = new TypingSteps();
    steps.startsNewStep('insertText', 'a', 0, true, '');
    steps.afterInput(1);
    expect(steps.startsNewStep('deleteContentBackward', null, 1, true, 'a')).toBe(true);
  });
});
