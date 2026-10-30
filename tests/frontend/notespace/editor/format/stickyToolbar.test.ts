import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SelectionToolbar } from '../../../../../src/frontend/notespace/editor/format/SelectionToolbar';
import { ContinuousEditor } from '../../../../../src/frontend/notespace/editor/text/ContinuousEditor';
import { StructuredEditor } from '../../../../../src/frontend/notespace/editor/text/StructuredEditor';
import { EditorSession } from '../../../../../src/frontend/notespace/editor/session';
import { createNote, getNote, updateNote } from '../../../../../src/frontend/notespace/store';

let root: Root;
let session: EditorSession;
const content = '<p>Before</p><p>Keep these words together</p><p>After</p>';
const originalBounds = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
const originalRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));

  /* jsdom has no text layout; the toolbar only needs a stable selection rectangle. */
  const box = new DOMRect(100, 100, 100, 20);
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => box });
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [box] });
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalBounds) Object.defineProperty(Range.prototype, 'getBoundingClientRect', originalBounds);
  else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  if (originalRects) Object.defineProperty(Range.prototype, 'getClientRects', originalRects);
  else Reflect.deleteProperty(Range.prototype, 'getClientRects');
});

function selectWords() {
  const text = session.body()!.querySelectorAll('p')[1].firstChild!;
  const range = document.createRange();
  range.setStart(text, 5);
  range.setEnd(text, 16);
  act(() => {
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
}

function mount(structured: boolean, locked = false) {
  const note = createNote();
  updateNote(note.id, { content });
  session = new EditorSession(note.id, content);
  act(() => root.render(createElement(Fragment, null,
    createElement(structured ? StructuredEditor : ContinuousEditor, { session, content, locked }),
    createElement(SelectionToolbar, { session, locked })
  )));
  selectWords();
}

describe.each([false, true])('Sticky toolbar (structured: %s)', structured => {
  it('sticks the entire line from selected words, saves it, and supports undo and redo', () => {
    mount(structured);
    const button = document.querySelector<HTMLButtonElement>('.selection-toolbar .note-sticky-button')!;
    expect(button.disabled).toBe(false);
    act(() => button.click());
    const saved = getNote(session.noteId)!.content;
    expect(saved).toBe('<p>Before</p><div class="sticky-group"><p>Keep these words together</p></div><p>After</p>');
    act(() => session.undo());
    expect(getNote(session.noteId)!.content).toBe(content);
    act(() => session.redo());
    expect(getNote(session.noteId)!.content).toBe(saved);
  });

  it('unsticks from a partial selection inside the group', () => {
    mount(structured);
    act(() => document.querySelector<HTMLButtonElement>('.note-sticky-button')!.click());
    selectWords();
    const button = document.querySelector<HTMLButtonElement>('.note-sticky-button')!;
    expect(button.getAttribute('aria-pressed')).toBe('true');
    act(() => button.click());
    expect(getNote(session.noteId)!.content).toBe(content);
  });

  it('does not offer Sticky in a locked note', () => {
    mount(structured, true);
    expect(document.querySelector('.note-sticky-button')).toBeNull();
  });
});

it('shows mobile undo and redo alongside selected text tools', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  mount(false);
  const toolbar = document.querySelector('.selection-toolbar.is-mobile');
  expect(toolbar?.querySelector('[aria-label="Undo"]')).not.toBeNull();
  expect(toolbar?.querySelector('[aria-label="Redo"]')).not.toBeNull();
  expect(toolbar?.querySelector('.note-sticky-button')).not.toBeNull();

  act(() => {
    window.getSelection()?.collapseToEnd();
    document.dispatchEvent(new Event('selectionchange'));
  });
  expect(toolbar?.querySelector<HTMLButtonElement>('[aria-label="Bold"]')?.disabled).toBe(true);
  expect(toolbar?.querySelector<HTMLButtonElement>('[aria-label="Comment"]')?.disabled).toBe(true);
  expect(toolbar?.querySelector('[aria-label="Undo"]')).not.toBeNull();
});
