import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePages, pageGeometry, type PageGeometry } from '../../../../../src/frontend/notespace/editor/layout/pagination';
import { EditorSession } from '../../../../../src/frontend/notespace/editor/session';

let root: Root;
let frame: HTMLDivElement;
let body: HTMLDivElement;
let session: EditorSession;
let resize: () => void;
let callbacks: Map<number, FrameRequestCallback>;
let id = 0;
function Hook({ geometry = pageGeometry('a4', false) }: { geometry?: PageGeometry }) {
  usePages(session, { current: frame }, geometry, 'test');
  return null;
}
function render(geometry?: PageGeometry) { act(() => root.render(createElement(Hook, { geometry }))); }
async function flush() {
  await act(async () => { await Promise.resolve(); const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(run => run(0)); });
}
function spacers() { return body.querySelectorAll('.page-cell-break').length; }
function selectAllRows() {
  const cells = body.querySelectorAll('td');
  window.getSelection()!.setBaseAndExtent(cells[0].firstChild!, 1, cells[2].lastChild!, 1);
}
function mark() { body.firstElementChild!.classList.add('page-pushed'); }
function marked() { return body.firstElementChild!.classList.contains('page-pushed'); }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  callbacks = new Map();
  vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback) => { callbacks.set(++id, run); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
  vi.stubGlobal('ResizeObserver', class { constructor(run: () => void) { resize = run; } observe() {} disconnect() {} });
  const host = document.createElement('div'); frame = document.createElement('div'); body = document.createElement('div');
  frame.append(body); document.body.append(host, frame);
  session = new EditorSession('pagination-events-fixture', ''); session.setBody(body);
  root = createRoot(host); render();
  body.innerHTML = `<table><tbody>${Array.from({ length: 3 }, () => '<tr data-split="true"><td>Before<span class="page-cell-break" contenteditable="false"></span>After</td></tr>').join('')}</tbody></table>`;

  /* Do not run the initial frame before simulating an edit beside existing spacers. */
  callbacks.clear(); selectAllRows();
});
afterEach(() => { act(() => root.unmount()); window.getSelection()?.removeAllRanges(); document.body.replaceChildren(); vi.unstubAllGlobals(); });

describe('pagination edit integration', () => {
  it.each(['Backspace', 'Delete', 'Enter'])('removes spacers in every selected row before %s reaches the editor', async key => {
    body.addEventListener('keydown', event => { expect(spacers()).toBe(0); event.preventDefault(); });
    body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    expect(window.getSelection()!.toString()).toBe('eforeAfterBeforeAfterBeforeA');
    mark(); await flush(); expect(marked()).toBe(false);
  });
  it.each(['deleteContentBackward', 'deleteContentForward', 'deleteByCut', 'insertText', 'insertReplacementText', 'insertFromPaste', 'insertLineBreak'])('cleans beforeinput %s, including cancelled inputs', async inputType => {
    body.addEventListener('beforeinput', event => { expect(spacers()).toBe(0); event.preventDefault(); });
    body.dispatchEvent(new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true }));
    mark(); await flush(); expect(marked()).toBe(false);
  });
  it('restores layout after a custom cut with no input event', async () => {
    body.dispatchEvent(new Event('cut', { bubbles: true }));
    expect(spacers()).toBe(0); mark(); await flush(); expect(marked()).toBe(false);
  });
  it('keeps composition frozen across saves, resize callbacks, paper changes and IME process keys', async () => {
    body.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    expect(spacers()).toBe(0); mark();
    act(() => session.relayout()); resize(); await flush(); expect(marked()).toBe(true);
    render(pageGeometry('letter', true)); await flush(); expect(marked()).toBe(true);
    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Process', keyCode: 229, bubbles: true }));
    body.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', isComposing: true, bubbles: true }));
    await flush(); expect(marked()).toBe(true);
    body.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    await flush(); expect(marked()).toBe(false);
  });
  it('recovers if composition ends by blur without compositionend', async () => {
    body.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); mark();
    body.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await flush(); expect(marked()).toBe(false);
  });
  it('does not carry an interrupted composition into a replacement editor', async () => {
    body.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const replacement = body.cloneNode(true) as HTMLDivElement;
    body.replaceWith(replacement); body = replacement; session.setBody(body); mark();
    act(() => session.relayout()); await flush(); expect(marked()).toBe(false);
  });
});
