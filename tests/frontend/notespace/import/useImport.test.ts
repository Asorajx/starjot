import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useImport } from '../../../../src/frontend/notespace/import/useImport';
import { importFiles, type ImportResult } from '../../../../src/frontend/notespace/import/importNotes';
import { ImageTools } from '../../../../src/frontend/notespace/editor/images/ImageTools';
import { onlyImageFiles } from '../../../../src/frontend/notespace/editor/images/images';
import { EditorSession } from '../../../../src/frontend/notespace/editor/session';

vi.mock('../../../../src/frontend/notespace/import/importNotes', () => ({ IMPORT_ACCEPT: '.txt', importFiles: vi.fn() }));

let root: Root;
let host: HTMLDivElement;
let session: EditorSession;
const opened = vi.fn();
const imported = vi.fn();
const childDrop = vi.fn();

function Screen() {
  const importer = useImport(opened, imported);
  return createElement('div', {
    onDropCapture: importer.dropProps.onDrop,
    onDragOverCapture: importer.dropProps.onDragOver,
    onDragLeaveCapture: importer.dropProps.onDragLeave
  }, createElement('div', {
    className: 'note-body', contentEditable: true, suppressContentEditableWarning: true,
    ref: (element: HTMLDivElement | null) => session.setBody(element)
  }, createElement('div', { id: 'drop-child', onDrop: childDrop })),
  createElement(ImageTools, { session, locked: false }), importer.elements);
}

function drop(types = ['Files']) {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { types, files: [new File(['Hello'], 'hello.txt')] } });
  host.querySelector('#drop-child')!.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  session = new EditorSession('drop-regression', '');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(createElement(Screen)));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});


/* =========================
   Viewport File Drops
   ========================= */

describe('viewport imports', () => {
  it('imports from an open note despite its document-level image handlers', async () => {
    vi.mocked(importFiles).mockResolvedValue({ created: ['one', 'two'], failed: [] });
    await act(async () => { expect(drop().defaultPrevented).toBe(true); });
    expect(importFiles).toHaveBeenCalledTimes(1);
    expect(childDrop).not.toHaveBeenCalled();
    expect(imported).toHaveBeenCalledWith(['one', 'two']);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it('recognises image-only drags before files are exposed and leaves mixed drops for import', () => {
    const image = new File(['picture'], 'picture.png', { type: 'image/png' });
    const text = new File(['note'], 'note.txt', { type: 'text/plain' });
    expect(onlyImageFiles({ files: [image] } as unknown as DataTransfer)).toBe(true);
    expect(onlyImageFiles({ files: [image, text] } as unknown as DataTransfer)).toBe(false);
    expect(onlyImageFiles({ items: [{ kind: 'file', type: 'image/png' }] } as unknown as DataTransfer)).toBe(true);
    expect(onlyImageFiles({ items: [{ kind: 'file', type: '' }] } as unknown as DataTransfer)).toBe(false);
    expect(onlyImageFiles(null)).toBe(false);
  });

  it('leaves internal text and tab drags alone', async () => {
    await act(async () => { expect(drop(['text/plain']).defaultPrevented).toBe(false); });
    expect(childDrop).toHaveBeenCalledTimes(1);
    expect(importFiles).not.toHaveBeenCalled();
  });

  it('queues a second drop while the first file is still being read', async () => {
    let finish!: (result: ImportResult) => void;
    vi.mocked(importFiles).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    vi.mocked(importFiles).mockResolvedValueOnce({ created: ['two'], failed: [] });
    await act(async () => { drop(); drop(); });
    expect(importFiles).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ created: ['one'], failed: [] }); });
    expect(importFiles).toHaveBeenCalledTimes(2);
    expect(imported.mock.calls).toEqual([[['one']], [['two']]]);
  });

  it('opens successful imports even when another file fails', async () => {
    vi.mocked(importFiles).mockResolvedValue({ created: ['one'], failed: [{ name: 'bad.docx', reason: 'Unsupported file' }] });
    await act(async () => { drop(); });
    expect(imported).toHaveBeenCalledWith(['one']);
    expect(host.textContent).toContain('bad.docx');
    expect(host.textContent).toContain('Unsupported file');
    expect(opened).not.toHaveBeenCalled();
  });
});
