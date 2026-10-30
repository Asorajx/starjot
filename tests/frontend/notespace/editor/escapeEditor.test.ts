import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { NoteEditor } from '../../../../src/frontend/notespace/editor/NoteEditor';
import { createNote } from '../../../../src/frontend/notespace/store';

it('closes an open panel before Escape leaves the note', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onClose = vi.fn();
  const noop = () => {};
  const note = createNote();
  try {
    act(() => root.render(createElement(NoteEditor, {
      noteId: note.id, tabId: 'escape-test', active: true,
      history: { back: null, forward: null, onBack: noop, onForward: noop },
      view: { split: null, stacked: false, tabCount: 1, canStack: false, canUnsplit: false, onSplit: noop, onStack: noop, onUnsplit: noop },
      onClose, onOpenNote: noop, onOpenNoteInNewTab: noop, onGoToNote: noop,
      onOpenCategory: noop, onOpenHome: noop, onOpenNewPage: noop, onOpenSettings: noop
    })));
    const editor = document.querySelector<HTMLElement>('[data-note-editable]')!;
    expect(editor).not.toBeNull();
    const contents = document.querySelector<HTMLButtonElement>('button[aria-label="Contents"]')!;
    act(() => {
      editor.focus();
      contents.click();
    });
    expect(contents.getAttribute('aria-expanded')).toBe('true');
    act(() => editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(contents.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(editor);
    act(() => {
      editor.focus();
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(onClose).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
