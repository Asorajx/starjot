/* Browser fixture using the real editors, session, sanitizer and storage. */
/* Open /tests/browser/table-pagination.html on a separate dev-server address. */
/* Reset fixture creates a test note; its address survives reloads. */
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ContinuousEditor } from '../../src/frontend/notespace/editor/text/ContinuousEditor';
import { StructuredEditor } from '../../src/frontend/notespace/editor/text/StructuredEditor';
import { EditorSession, useSessionValue } from '../../src/frontend/notespace/editor/session';
import { createSavedNote, getNote, save } from '../../src/frontend/notespace/store';
import { pageGeometry, pageStep, usePages } from '../../src/frontend/notespace/editor/layout/pagination';
import { ROW_SPLITTING_ENABLED } from '../../src/frontend/notespace/editor/layout/rowBreakFeature';
import { cleanHtml } from '../../src/frontend/notespace/sanitize';
import { TableTools } from '../../src/frontend/notespace/editor/tables/TableTools';
import '../../src/frontend/app/styles.css';
import '../../src/frontend/app/accents.css';
import '../../src/frontend/notespace/editor/editor.css';
import '../../src/frontend/notespace/editor/text/text.css';
import '../../src/frontend/notespace/editor/tables/tables.css';
import '../../src/frontend/notespace/editor/drawing/drawing.css';
import '../../src/frontend/notespace/print.css';

const fixture = `<p>Pagination regression fixture</p><table class="repeat-header"><tbody><tr><th>Long cell</th><th>Short cell</th></tr><tr data-split="true"><td>${Array.from({ length: 80 }, (_, i) => `Long line ${i + 1}`).join('<br>')}</td><td>${Array.from({ length: 22 }, (_, i) => `Other line ${i + 1}`).join('<br>')}</td></tr><tr><td>Last row</td><td>Last cell</td></tr></tbody></table><p>After table</p>`;
const reopened = getNote(location.hash.slice(1));

function Harness() {
  const [session, setSession] = useState<EditorSession | null>(() => reopened ? new EditorSession(reopened.id, reopened.content) : null);
  const reset = (content = fixture) => {
    const note = createSavedNote({ title: 'Table pagination browser fixture', content, mode: 'continuous', layout: 'paginated' });
    if (note) { location.hash = note.id; setSession(new EditorSession(note.id, note.content)); }
  };
  return <><div className="test-bar"><strong>Row splitting: {String(ROW_SPLITTING_ENABLED)}</strong><button onClick={() => reset()}>Reset fixture</button>
    <button onClick={() => reset(fixture.replace(/Long line 1<br>[\s\S]*?Long line 80/, 'Wrapped text with spaces. '.repeat(400)))}>Reset wrapped fixture</button>
    <button onClick={() => reset(fixture.replaceAll('<br>', '<br><br>'))}>Reset blank-line fixture</button>
    </div>
    {session && <Editor key={session.noteId} session={session} />}</>;
}

function Editor({ session }: { session: EditorSession }) {
  const frame = useRef<HTMLDivElement>(null);
  const revision = useSessionValue(session, state => state.revision);
  const [mode, setMode] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [letter, setLetter] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [report, setReport] = useState('');
  const geometry = pageGeometry(letter ? 'letter' : 'a4', landscape);
  const pages = usePages(session, frame, geometry, `${mode}-${revision}`);
  const body = () => session.body()!;
  const seam = () => {
    const spacer = body().querySelector('.page-cell-break');
    if (!spacer) throw new Error('No split row; enable the experimental dev flag first.');
    let before = spacer.previousSibling;
    while (before && before.nodeType !== Node.TEXT_NODE) before = before.previousSibling;
    let after = spacer.nextSibling;
    while (after && after.nodeType !== Node.TEXT_NODE) after = after.nextSibling;
    if (!before || !after) throw new Error('Fixture seam does not have adjacent text.');
    return { before: before as Text, after: after as Text };
  };
  const select = (where: 'before' | 'after' | 'across') => {
    const { before, after } = seam();
    const range = document.createRange();
    range.setStart(where === 'after' ? after : before, where === 'after' ? 0 : before.length - (where === 'across' ? 3 : 0));
    if (where === 'across') range.setEnd(after, 3); else range.collapse(true);
    (before.parentElement?.closest('[contenteditable="true"]') as HTMLElement)?.focus();
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    after.parentElement?.scrollIntoView({ block: 'center' });
    session.checkpoint();
  };
  const inspect = () => {
    const bounds = frame.current!.getBoundingClientRect();
    const violations: object[] = [];
    const walker = document.createTreeWalker(body(), NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent?.trim() || !node.parentElement?.closest('td, th')) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const box of Array.from(range.getClientRects())) {
        if (!box.height) continue;
        const top = (box.top - bounds.top) / zoom, bottom = (box.bottom - bounds.top) / zoom;
        const page = Math.floor(top / pageStep(geometry));
        if (top < page * pageStep(geometry) + geometry.margin - 1 || bottom > page * pageStep(geometry) + geometry.height - geometry.margin + 1) violations.push({ text: node.textContent, top, bottom });
      }
    }
    for (const br of Array.from(body().querySelectorAll('td br, th br'))) {
      const box = br.getBoundingClientRect();
      const top = (box.top - bounds.top) / zoom, bottom = (box.bottom - bounds.top) / zoom;
      const page = Math.floor(top / pageStep(geometry));
      if (box.height && (top < page * pageStep(geometry) + geometry.margin - 1 || bottom > page * pageStep(geometry) + geometry.height - geometry.margin + 1)) violations.push({ text: '<br>', top, bottom });
    }
    const selection = window.getSelection();
    setReport(JSON.stringify({ pages, spacers: body().querySelectorAll('.page-cell-break').length,
      violations, text: body().querySelector('tr[data-split] td')?.textContent,
      caret: { text: selection?.focusNode?.textContent, offset: selection?.focusOffset },
      clean: cleanHtml(body().innerHTML), stored: getNote(session.noteId)?.content,
      canUndo: session.getSnapshot().canUndo, canRedo: session.getSnapshot().canRedo }, null, 2));
  };
  return <><div className="test-bar">
    <button onClick={() => select('before')}>Caret before gap</button><button onClick={() => select('after')}>Caret after gap</button>
    <button onClick={() => select('across')}>Select across gap</button>
    <button onMouseDown={e => e.preventDefault()} onClick={() => session.undo()}>Undo</button>
    <button onMouseDown={e => e.preventDefault()} onClick={() => session.redo()}>Redo</button>
    <button onMouseDown={e => e.preventDefault()} onClick={inspect}>Inspect</button>
    <button onClick={() => { session.commit(); save(); location.reload(); }}>Save and reopen</button>
    <button onClick={() => setMode(value => !value)}>Mode: {mode ? 'Block' : 'Continuous'}</button>
    <button onMouseDown={e => e.preventDefault()} onClick={() => setLandscape(value => !value)}>Orientation: {landscape ? 'Landscape' : 'Portrait'}</button>
    <button onMouseDown={e => e.preventDefault()} onClick={() => setLetter(value => !value)}>Paper: {letter ? 'Letter' : 'A4'}</button>
    <button onMouseDown={e => e.preventDefault()} onClick={() => setZoom(value => value === 1 ? 1.5 : value === 1.5 ? 0.8 : 1)}>Zoom: {zoom}</button>
    <button onMouseDown={e => e.preventDefault()} onClick={() => body().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))}>Begin simulated IME</button>
    <button onMouseDown={e => e.preventDefault()} onClick={() => body().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))}>End simulated IME</button>
    <button onMouseDown={e => e.preventDefault()} onClick={() => session.relayout()}>Request layout</button>
    <button onClick={() => { const row = body().querySelector('tr[data-split]')!; row.removeAttribute('data-split'); session.commit(); }}>Disable row setting</button>
  </div><output id="report">{report}</output><div className="main-scroll"><div className="editor-wrap is-paginated"><main className="editor-canvas is-paginated">
    <div ref={frame} className="editor-width is-paginated" style={{ zoom, width: geometry.width, maxWidth: 'none', padding: geometry.margin, minHeight: pages * pageStep(geometry) - geometry.gap }}>
      <div className="page-sheets" aria-hidden="true">{Array.from({ length: pages }, (_, i) => <div className="page-sheet" key={i} style={{ top: i * pageStep(geometry), height: geometry.height }}><span className="page-number">{i + 1}</span></div>)}</div>
      <div className="page-preview-overlays" /><div className="note-content">
        {mode ? <StructuredEditor key={`block-${revision}`} session={session} content={getNote(session.noteId)!.content} locked={false} />
          : <ContinuousEditor key={`continuous-${revision}`} session={session} content={getNote(session.noteId)!.content} locked={false} />}
      </div>
    </div></main></div></div><TableTools session={session} locked={false} /></>;
}

/* Keep test controls outside the editor; selected text remains available to Inspect/undo/IME. */
const style = document.createElement('style');
style.textContent = 'html,body,#root{height:100%;overflow:auto} .test-bar{position:sticky;top:0;z-index:100;display:flex;flex-wrap:wrap;gap:8px;padding:8px;background:white;color:black} .test-bar button{padding:6px;border:1px solid #aaa} #report{display:block;max-height:120px;overflow:auto;white-space:pre-wrap;font:12px monospace} .main-scroll{height:70vh;overflow:auto} .note-body>p:first-child,.block-editor>.editable-block:first-child{min-height:650px}';
document.head.append(style);
document.execCommand('defaultParagraphSeparator', false, 'p');
createRoot(document.getElementById('root')!).render(<Harness />);
