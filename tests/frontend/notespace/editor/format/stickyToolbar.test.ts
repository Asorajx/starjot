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
  expect(toolbar?.querySelector('.selection-toolbar-row .selection-kind.is-button')).not.toBeNull();

  act(() => {
    window.getSelection()?.collapseToEnd();
    document.dispatchEvent(new Event('selectionchange'));
  });
  expect(toolbar?.querySelector<HTMLButtonElement>('[aria-label="Bold"]')?.disabled).toBe(false);
  expect(toolbar?.querySelector<HTMLButtonElement>('[aria-label="Comment"]')?.disabled).toBe(true);
  expect(toolbar?.querySelector('[aria-label="Undo"]')).not.toBeNull();
});

it.each([false, true])('indents list items from the mobile toolbar with undo and redo (structured: %s)', structured => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  const list = '<ul><li>One</li><li>Two</li></ul>';
  const note = createNote();
  updateNote(note.id, { content: list });
  session = new EditorSession(note.id, list);
  act(() => root.render(createElement(Fragment, null,
    createElement(structured ? StructuredEditor : ContinuousEditor, { session, content: list, locked: false }),
    createElement(SelectionToolbar, { session, locked: false })
  )));
  act(() => {
    window.getSelection()?.collapse(session.body()!.querySelectorAll('li')[1].firstChild!, 2);
    document.dispatchEvent(new Event('selectionchange'));
  });
  const increase = document.querySelector<HTMLButtonElement>('[aria-label="Increase indent"]')!;
  expect(increase.disabled).toBe(false);
  act(() => increase.click());
  const indented = getNote(note.id)!.content;
  expect(indented).toContain('<li>One<ul><li>Two</li></ul></li>');
  act(() => session.undo());
  expect(getNote(note.id)!.content).toBe(list);
  act(() => session.redo());
  expect(getNote(note.id)!.content).toBe(indented);
  act(() => {
    window.getSelection()?.collapse(session.body()!.querySelectorAll('li')[1].firstChild!, 2);
    document.dispatchEvent(new Event('selectionchange'));
  });
  act(() => document.querySelector<HTMLButtonElement>('[aria-label="Decrease indent"]')!.click());
  expect(getNote(note.id)!.content).toBe(list);
});

it.each([false, true])('keeps the desktop caret in a bullet after Tab (structured: %s)', structured => {
  const list = '<ul><li>First</li><li>Second</li></ul>';
  const note = createNote();
  updateNote(note.id, { content: list });
  session = new EditorSession(note.id, list);
  act(() => root.render(createElement(Fragment, null,
    createElement(structured ? StructuredEditor : ContinuousEditor, { session, content: list, locked: false }),
    createElement(SelectionToolbar, { session, locked: false })
  )));
  const text = session.body()!.querySelectorAll('li')[1].firstChild!;
  act(() => {
    window.getSelection()?.collapse(text, 0);
    document.dispatchEvent(new Event('selectionchange'));
    text.parentElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  });
  expect(window.getSelection()?.anchorNode).toBe(text);
  expect(window.getSelection()?.anchorOffset).toBe(0);
  expect(getNote(note.id)!.content).toContain('<li>First<ul><li>Second</li></ul></li>');
});

it.each([false, true])('indents a mobile text line and saves it with undo and redo (structured: %s)', structured => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  mount(structured);
  act(() => {
    window.getSelection()?.collapseToEnd();
    document.dispatchEvent(new Event('selectionchange'));
  });
  const increase = document.querySelector<HTMLButtonElement>('[aria-label="Increase indent"]')!;
  for (let level = 1; level <= 4; level += 1) {
    act(() => increase.click());
    expect(getNote(session.noteId)!.content).toContain(`<p data-indent="${level}">Keep these words together</p>`);
  }
  expect(increase.disabled).toBe(true);
  act(() => session.undo());
  expect(getNote(session.noteId)!.content).toContain('data-indent="3"');
  act(() => session.redo());
  expect(getNote(session.noteId)!.content).toContain('data-indent="4"');
});

it.each([false, true])('indents selected desktop text with the toolbar (structured: %s)', structured => {
  mount(structured);
  act(() => document.querySelector<HTMLButtonElement>('[aria-label="Increase indent"]')!.click());
  expect(getNote(session.noteId)!.content).toContain('<p data-indent="1">Keep these words together</p>');
  expect(window.getSelection()?.toString()).toBe('these words');
  act(() => document.querySelector<HTMLButtonElement>('[aria-label="Decrease indent"]')!.click());
  expect(getNote(session.noteId)!.content).toBe(content);
});

it.each([false, true])('uses Tab to indent a text line and keeps its caret (structured: %s)', structured => {
  mount(structured);
  const text = session.body()!.querySelectorAll('p')[1].firstChild!;
  act(() => {
    window.getSelection()?.collapse(text, 2);
    document.dispatchEvent(new Event('selectionchange'));
    text.parentElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  });
  expect(getNote(session.noteId)!.content).toContain('<p data-indent="1">Keep these words together</p>');
  expect(window.getSelection()?.anchorNode).toBe(text);
  expect(window.getSelection()?.anchorOffset).toBe(2);
  act(() => session.undo());
  expect(getNote(session.noteId)!.content).toBe(content);
});

it('updates mobile format indicators when the caret moves', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  const original = Object.getOwnPropertyDescriptor(document, 'queryCommandState');
  Object.defineProperty(document, 'queryCommandState', {
    configurable: true,
    value: (command: string) => command === 'bold' && (window.getSelection()?.anchorOffset ?? 0) < 10
  });
  try {
    mount(false);
    const bold = document.querySelector<HTMLButtonElement>('[aria-label="Bold"]')!;
    const text = session.body()!.querySelectorAll('p')[1].firstChild!;
    act(() => {
      window.getSelection()?.collapse(text, 5);
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(bold.getAttribute('aria-pressed')).toBe('true');
    act(() => {
      window.getSelection()?.collapse(text, 15);
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(bold.getAttribute('aria-pressed')).toBe('false');
  } finally {
    if (original) Object.defineProperty(document, 'queryCommandState', original);
    else Reflect.deleteProperty(document, 'queryCommandState');
  }
});

it.each([false, true])('changes only the caret line on mobile (structured: %s)', structured => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  mount(structured);
  const paragraphs = session.body()!.querySelectorAll('p');
  act(() => {
    window.getSelection()!.setBaseAndExtent(paragraphs[0].firstChild!, 2, paragraphs[1].firstChild!, 5);
    document.dispatchEvent(new Event('selectionchange'));
  });
  const button = hostButton('turn into another kind of line');
  expect(button.disabled).toBe(false);
  act(() => button.click());
  const heading = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')].find(item => item.textContent?.includes('Heading 2'))!;
  act(() => heading.click());
  expect(getNote(session.noteId)!.content).toBe('<p>Before</p><h2>Keep these words together</h2><p>After</p>');
  act(() => session.undo());
  expect(getNote(session.noteId)!.content).toBe(content);
});

it.each([false, true])('opens the mobile line menu with a collapsed caret (structured: %s)', structured => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  mount(structured);
  const text = session.body()!.querySelectorAll('p')[1].firstChild!;
  act(() => {
    window.getSelection()!.collapse(text, 5);
    document.dispatchEvent(new Event('selectionchange'));
  });
  act(() => hostButton('turn into another kind of line').click());
  const heading = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')].find(item => item.textContent?.includes('Heading 2'))!;
  act(() => heading.click());
  expect(getNote(session.noteId)!.content).toBe('<p>Before</p><h2>Keep these words together</h2><p>After</p>');
});

function hostButton(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.getAttribute('aria-label')?.includes(label))!;
}

it.each([false, true])('closes line choices when clicking outside (mobile: %s)', mobile => {
  vi.stubGlobal('matchMedia', () => ({ matches: mobile, addEventListener() {}, removeEventListener() {} }));
  mount(false);
  act(() => hostButton('turn into another kind of line').click());
  expect(document.querySelector('[aria-label="Turn into"]')).not.toBeNull();
  act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(document.querySelector('[aria-label="Turn into"]')).toBeNull();
});

