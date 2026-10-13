import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { changeZoom, usePreferences } from '../../app/preferences';
import { DeleteNoteDialog } from '../DeleteNoteDialog';
import { FindBar } from './find/FindBar';
import { takeFindForNote } from './find/pendingFind';
import { Icon } from '../../components/Icon';
import {
  deleteNote, flushSave, getNote, isLocked, isTemporarilyUnlocked, markOpened, setPinned, updateNote,
  updatedLabel, useCategories, useNote
} from '../store';
import type { NoteMode } from '../../../shared/types/note';
import type { SettingsSection } from '../../settings/Settings';
import { CodeLanguagePickers } from './code/CodeLanguagePickers';
import { CommentLayer } from './comments/CommentLayer';
import { ContinuousEditor } from './text/ContinuousEditor';
import { NoteSettings, TableOfContents, type ViewControls } from './EditorPanels';
import { SelectionToolbar } from './format/SelectionToolbar';
import { SlashMenu } from './text/SlashMenu';
import { TableTools } from './tables/TableTools';
import { BlockWidgets } from './text/BlockWidgets';
import { DrawingLayer } from './drawing/DrawingLayer';
import { LockStatus } from './LockStatus';
import { DrawingTools } from './drawing/DrawingTools';
import { emptyParagraph } from './text/dom';
import { ExportDialog } from '../export/ExportDialog';
import { TEXT_LAYER } from './drawing/drawing';
import { ImageTools } from './images/ImageTools';
import { LinkTools } from './links/LinkTools';
import { copyPageLink } from './links/links';
import { NoteBreadcrumb } from './NoteBreadcrumb';
import { PageBar, SaveStatus, type PageHistory } from '../PageBar';
import { NoteHeader } from './NoteHeader';
import { pageGeometry, pageStep, usePages } from './layout/pagination';
import { EditorSession, useSessionValue } from './session';
import { StructuredEditor } from './text/StructuredEditor';
import { zoomed } from '../../lib/geometry';
import { useMediaQuery } from '../../lib/useMediaQuery';

type Panel = 'toc' | 'settings' | null;

/* A note's 100% zoom shows it at this size, so its text reads comfortably (about 15.6px for */
/* body text, which is styled at 13px). Zoom and Small text scale from here. Phones (the phone */
/* layout starts at 700px wide) keep the note's own size: 1.2 fits too few words on a line. */
const BASE_SCALE = 1.2;
const PHONE_BASE_SCALE = 1;

/* Small text shows a note at this share of its size. */
const SMALL_TEXT_SCALE = 0.875;

type NoteEditorProps = {
  noteId: string;

  /* Where the page bar's back and forward arrows lead. */
  history: PageHistory;

  /* Splitting and stacking the tab group this note is shown in. */
  view: ViewControls;

  /* True for the active tab of the focused group. Only that note answers keyboard shortcuts such as */
  /* Ctrl + Z, because a split window or a stack can show several notes at once. */
  active: boolean;

  /* Leaves the note (Escape, or after deleting it). */
  onClose: () => void;
  onOpenNote: (id: string) => void;

  /* Opens a page in a new tab (Ctrl + click or double-click on a page link). */
  onOpenNoteInNewTab: (id: string) => void;
  onOpenCategory: (id: string) => void;

  /* Opens a sub-page just added with the slash menu, ready to be named. */
  onOpenNewPage: (id: string) => void;

  /* Opens Settings at one group of settings (the drawing toolbar's settings button). */
  onOpenSettings: (section: SettingsSection) => void;
};


/* =========================
   Note Editor Screen
   ========================= */

/* The column of a paginated note: one page wide, padded by the page margin, and as tall as its */
/* pages (the last page is shown in full even when it is nearly empty). */
function pageFrameStyle(geometry: ReturnType<typeof pageGeometry>, pages: number): CSSProperties {
  return {
    width: geometry.width,
    maxWidth: 'none',
    minHeight: pages * pageStep(geometry) - geometry.gap,
    padding: geometry.margin
  };
}

export function NoteEditor({ noteId, history, view, active, onClose, onOpenNote, onOpenNoteInNewTab, onOpenCategory, onOpenNewPage, onOpenSettings }: NoteEditorProps) {
  const note = useNote(noteId);

  /* Re-render when categories are renamed, so the breadcrumb stays current. */
  useCategories();
  const { zoom, hideHeaderWhileTyping } = usePreferences();
  const [panel, setPanel] = useState<Panel>(null);
  const [switching, setSwitching] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  /* The find bar, while open: the selected text it searches (or null for the whole note), */
  /* whether it opened with its replace row (Ctrl+H), and any words to find straight away. A note */
  /* opened from search starts with the find bar showing the words that matched. */
  const [finding, setFinding] = useState<{ within: Range | null; replacing: boolean; words?: string } | null>(() => {
    const words = takeFindForNote(noteId);
    return words ? { within: null, replacing: false, words } : null;
  });
  const [exporting, setExporting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLElement>(null);
  const drawingRef = useRef<HTMLDivElement>(null);

  /* Ids that link the panel buttons to their panels; each open note needs its own. */
  const panelId = useId();

  /* A locked note may be unlocked for a short time; it locks itself again when that time is up, */
  /* so the lock is checked again every few seconds while the countdown runs. */
  const temporary = note ? isTemporarilyUnlocked(note) : false;
  const locked = note ? isLocked(note) : false;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!temporary) return;
    const timer = window.setInterval(() => setTick(tick => tick + 1), 5000);
    return () => window.clearInterval(timer);
  }, [temporary]);

  /* Drawing mode (the pencil in the page bar) lets the mouse draw over the note. A locked note */
  /* shows its drawing but cannot be drawn on. */
  const [drawingMode, setDrawingMode] = useState(false);
  const drawing = drawingMode && !locked;

  /* The layer being drawn on. It starts as the top drawing layer, and moves to another one if */
  /* it is removed (or undone away). */
  const [chosenLayer, setChosenLayer] = useState('');
  const drawingLayers = note?.drawingLayers.filter(layer => layer.id !== TEXT_LAYER) ?? [];
  const activeLayer = drawingLayers.some(layer => layer.id === chosenLayer) ? chosenLayer : drawingLayers.at(-1)?.id ?? '';

  /* One editing session per open note: undo history, Sticky state and editor actions. */
  const session = useMemo(() => new EditorSession(noteId, getNote(noteId)?.content ?? ''), [noteId]);
  const { canUndo, canRedo, sticky } = useSessionValue(session, snapshot => snapshot);
  const revision = useSessionValue(session, snapshot => snapshot.revision);

  /* Show edits made to this note in another pane. */
  useEffect(() => session.watch(), [session]);

  /* A paginated note is laid out on page-sized sheets; frameRef is the column the sheets are drawn in. */
  const frameRef = useRef<HTMLDivElement>(null);
  const geometry = note?.layout === 'paginated' ? pageGeometry(note.pageSize, note.landscape) : null;
  const pages = usePages(session, frameRef, geometry, `${note?.mode}-${revision}`);

  /* Small text and Full width only apply to pageless notes. */
  const smallText = Boolean(note?.smallText && !geometry);
  const fullWidth = Boolean(note?.fullWidth && !geometry);

  /* Pages wider than the pane scroll sideways. The page bar stays in view by being exactly as wide */
  /* as the pane, which CSS cannot read from inside the scrolling pane, so it is measured here. The */
  /* room left for the page beside the canvas's padding is measured too (see noteZoom). */
  const wrapRef = useRef<HTMLDivElement>(null);
  const paginated = Boolean(geometry);
  const [pageRoom, setPageRoom] = useState(0);
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const scroller = session.scroller();
    if (!paginated || !wrap || !scroller) return;
    const measure = () => {
      wrap.style.setProperty('--pane-width', `${scroller.clientWidth}px`);
      const style = canvasRef.current && getComputedStyle(canvasRef.current);
      setPageRoom(scroller.clientWidth - (style ? parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) : 0));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => {
      observer.disconnect();
      wrap.style.removeProperty('--pane-width');
    };
  }, [paginated, session, revision]);

  /* 100% shows notes at BASE_SCALE. A paginated page too wide for the pane at that size (on a */
  /* phone, say) is shown at the size that fits instead, so 100% means "the whole page width"; */
  /* zooming in from there scrolls sideways. */
  const phone = useMediaQuery('(max-width: 700px)');
  const fitScale = geometry && pageRoom > 0 ? pageRoom / geometry.width : Infinity;
  const noteZoom = Math.min(phone ? PHONE_BASE_SCALE : BASE_SCALE, fitScale) * zoom * (smallText ? SMALL_TEXT_SCALE : 1);

  /* Remember when the note was opened, and save pending edits when leaving it. */
  useEffect(() => {
    markOpened(noteId);
    return () => flushSave();
  }, [noteId]);

  /* Keyboard shortcuts for the whole editor screen. */
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!active || event.defaultPrevented || event.isComposing) return;
      const target = event.target as HTMLElement;
      const inField = Boolean(target.closest?.('input, textarea, select, [data-remarks]'));
      const inEditor = Boolean(session.body()?.contains(target));
      const key = event.key.toLowerCase();
      const command = (event.ctrlKey || event.metaKey) && !event.altKey;

      /* Escape closes an open panel first, then leaves drawing mode, then returns to the Notespace */
      /* home page. */
      if (event.key === 'Escape') {
        event.preventDefault();
        if (panel) setPanel(null);
        else if (drawing) setDrawingMode(false);
        else onClose();
        return;
      }

      /* Ctrl+F finds words in the note, and Ctrl+H replaces them, instead of the browser's own */
      /* find. Text selected in the note limits the search to it. */
      if (command && (key === 'f' || key === 'h')) {
        event.preventDefault();
        const selection = window.getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        const selected = range && !range.collapsed && session.body()?.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
        setFinding(current => ({ within: selected ?? (inEditor || !current ? null : current.within), replacing: key === 'h' }));
        return;
      }

      /* Ctrl + = / Ctrl + − / Ctrl + 0 zoom the note instead of the whole window. */
      if (command && (key === '=' || key === '+' || key === '-' || key === '0')) {
        event.preventDefault();
        changeZoom(key === '0' ? 0 : key === '-' ? -1 : 1);
        return;
      }

      /* Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z use the note's history; the title field keeps its own undo. */
      if (command && (key === 'z' || key === 'y') && !inField) {
        event.preventDefault();
        if (locked) return;
        if (key === 'y' || event.shiftKey) session.redo();
        else session.undo();
        return;
      }

      /* Ctrl+A outside the text selects the note's text instead of the whole screen. */
      if (command && key === 'a' && !inField && !inEditor) {
        event.preventDefault();
        session.selectAll();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [active, panel, session, onClose, locked, drawing]);

  /* Ctrl + mouse wheel over the note zooms it. The listener is not passive so the page does not zoom. */
  useEffect(() => {
    const canvas = canvasRef.current;
    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      changeZoom(event.deltaY < 0 ? 1 : -1);
    }
    canvas?.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas?.removeEventListener('wheel', handleWheel);
  }, []);

  /* While typing, the page bar fades away so only the note is in view; moving the mouse brings it */
  /* back. It keeps its space, so the page does not jump. (An app setting, on by default.) */
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (!hideHeaderWhileTyping) return;
    let lastPointer = '';
    function handleInput(event: Event) {
      if (canvasRef.current?.contains(event.target as Node)) setTyping(true);
    }

    /* Some browsers send a mouse move when the page changes under a still pointer, so only a real */
    /* change of position counts. */
    function handleMouseMove(event: MouseEvent) {
      const pointer = `${event.screenX},${event.screenY}`;
      if (pointer !== lastPointer) setTyping(false);
      lastPointer = pointer;
    }
    document.addEventListener('input', handleInput);
    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('input', handleInput);
      document.removeEventListener('mousemove', handleMouseMove);
      setTyping(false);
    };
  }, [hideHeaderWhileTyping]);

  /* Clicking outside an open panel closes it. */
  useEffect(() => {
    if (!panel) return;
    function handleMouseDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('.editor-flyout, [data-panel-toggle]')) setPanel(null);
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [panel]);

  if (!note) return <p className="content-pad">This note is no longer available.</p>;

  function changeMode(mode: NoteMode) {
    if (!note || note.mode === mode) return;
    updateNote(note.id, { mode });
    setSwitching(true);
  }

  function removeNote(withSubNotes: boolean) {
    setConfirmDelete(false);
    deleteNote(noteId, withSubNotes);
    onClose();
  }

  const togglePanel = (name: Exclude<Panel, null>) => setPanel(current => (current === name ? null : name));

  /* Clicking in the empty space below the text continues the note there: the caret goes to an */
  /* empty last line, which is added when the note ends with something else (a quote, code, a */
  /* table or a picture), so there is always a way to type below it. */
  function continueBelow(event: ReactMouseEvent) {
    const body = session.body();
    const target = event.target as Element;
    if (!body || locked || drawing || event.button !== 0) return;
    if (target.closest('.note-header, .editor-meta, a, button, input, select, textarea, [contenteditable="false"]')) return;
    if (body.contains(target) && target !== body && !target.matches('.block-content, .block-row, .structured-document')) return;

    /* In Block mode the line goes into the last block, which then becomes a block of its own. */
    const holder = note?.mode === 'blocks' ? Array.from(body.querySelectorAll<HTMLElement>('.block-content')).at(-1) : body;
    const last = holder?.lastElementChild;
    if (!holder || (last && event.clientY <= last.getBoundingClientRect().bottom)) return;
    event.preventDefault();

    const empty = last?.tagName === 'P' && !last.textContent?.trim() && !last.querySelector('.image-block, .page-block, .page-mention') ? last as HTMLElement : null;
    const line = empty ?? emptyParagraph();
    if (!empty) {
      session.checkpoint();
      holder.appendChild(line);
    }
    (holder.closest('[contenteditable="true"]') as HTMLElement | null)?.focus({ preventScroll: true });
    session.linesChanged(line, false);
  }

  /* How the note's text column is laid out, so an export can put loose drawings on the same words: */
  /* its width, and how far below the drawing's starting corner the text begins (both at 100% zoom). */
  function measureForExport() {
    const layer = drawingRef.current;
    const text = contentRef.current;
    if (!layer || !text) return { columnWidth: 760, textTop: 0 };
    const { rect, scale } = zoomed(layer);
    return { columnWidth: layer.offsetWidth, textTop: (text.getBoundingClientRect().top - rect.top) / scale };
  }

  /* Drawing takes the mouse away from the text, so any text selection (and its toolbar) is cleared. */
  function toggleDrawing() {
    if (!drawing) {
      window.getSelection()?.removeAllRanges();
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
    setDrawingMode(!drawing);
  }

  /* Undo, redo and Sticky keep the editor's selection by ignoring the mouse press itself. */
  const keepSelection = (event: ReactMouseEvent) => event.preventDefault();

  return (
    <div ref={wrapRef} className={`editor-wrap ${locked ? 'is-locked' : ''} ${geometry ? 'is-paginated' : ''} ${drawing ? 'is-drawing' : ''} ${smallText ? 'is-small-text' : ''} ${fullWidth ? 'is-full-width' : ''}`}>
      <PageBar history={history} className={`editor-page-bar ${typing && !panel ? 'is-hidden' : ''}`}>
        <NoteBreadcrumb note={note} onOpenNote={onOpenNote} onOpenCategory={onOpenCategory} />
        <span className="page-bar-fill" />
        <SaveStatus />

        <span className="page-bar-group" role="group" aria-label="Undo and redo">
          <button type="button" className="page-bar-button" data-tooltip="Undo (Ctrl + Z)" aria-label="Undo (Ctrl + Z)" disabled={!canUndo || locked} onMouseDown={keepSelection} onClick={() => session.undo()}>
            <Icon name="undo" size={17} />
          </button>
          <button type="button" className="page-bar-button" data-tooltip="Redo (Ctrl + Y)" aria-label="Redo (Ctrl + Y)" disabled={!canRedo || locked} onMouseDown={keepSelection} onClick={() => session.redo()}>
            <Icon name="redo" size={17} />
          </button>
        </span>

        {/* Turns red ("Unstick") when the selection is inside one sticky group. */}
        <button
          type="button"
          className={`page-bar-button note-sticky-button ${sticky === 'unstick' ? 'is-unstick' : ''}`}
          aria-pressed={sticky === 'unstick'}
          data-tooltip={sticky === 'unstick' ? 'Unstick' : 'Sticky'}
          aria-label={sticky === 'unstick' ? 'Unstick the selected group' : 'Sticky: keep the selected content together'}
          disabled={sticky === 'none' || locked}
          onMouseDown={keepSelection}
          onClick={() => session.toggleSticky()}
        >
          <Icon name="link" size={17} />
        </button>

        <button
          type="button"
          className={`page-bar-button ${drawing ? 'selected' : ''}`}
          aria-pressed={drawing}
          data-tooltip={drawing ? 'Stop drawing (Esc)' : 'Draw'}
          aria-label={drawing ? 'Stop drawing' : 'Draw'}
          disabled={locked}
          onClick={toggleDrawing}
        >
          <Icon name="pencil" size={17} />
        </button>

        <button type="button" data-panel-toggle className={`page-bar-button ${panel === 'toc' ? 'selected' : ''}`} data-tooltip={panel === 'toc' ? undefined : 'Contents'} aria-label="Contents" aria-expanded={panel === 'toc'} aria-controls={`${panelId}-toc`} onClick={() => togglePanel('toc')}>
          <Icon name="list" size={17} />
        </button>

        {/* Starred notes are listed in the sidebar and on the notes home page. */}
        <button
          type="button"
          className={`page-bar-button star-button ${note.pinned ? 'is-starred' : ''}`}
          aria-pressed={note.pinned}
          data-tooltip={note.pinned ? 'Unstar' : 'Star'}
          aria-label={note.pinned ? 'Unstar' : 'Star'}
          onClick={() => setPinned(note.id, !note.pinned)}
        >
          <Icon name="star" size={17} />
        </button>

        {note.locked && <LockStatus noteId={note.id} temporary={temporary} unlockedUntil={note.unlockedUntil} />}

        <button type="button" data-panel-toggle data-tooltip-align="end" className={`page-bar-button ${panel === 'settings' ? 'selected' : ''}`} data-tooltip={panel === 'settings' ? undefined : 'Note settings'} aria-label="Note settings" aria-expanded={panel === 'settings'} aria-controls={`${panelId}-settings`} onClick={() => togglePanel('settings')}>
          <Icon name="sliders-horizontal" size={17} />
        </button>

        {finding && (
          <FindBar
            session={session}
            locked={locked}
            content={note.content}
            within={finding.within}
            replacing={finding.replacing}
            initialWords={finding.words}
            onClearWithin={() => setFinding(current => current && { ...current, within: null })}
            onClose={() => setFinding(null)}
          />
        )}

        <TableOfContents id={`${panelId}-toc`} session={session} content={note.content} open={panel === 'toc'} onClose={() => setPanel(null)} />
        <NoteSettings
          id={`${panelId}-settings`}
          note={note}
          open={panel === 'settings'}
          zoom={zoom}
          view={view}
          onClose={() => setPanel(null)}
          onModeChange={changeMode}
          onStickyIndicatorChange={visible => updateNote(note.id, { stickyIndicator: visible })}
          onZoom={changeZoom}
          onLockChange={value => updateNote(note.id, { locked: value })}
          onPageChange={changes => updateNote(note.id, changes)}
          onCopyLink={() => copyPageLink(note.id)}
          onExport={() => { setPanel(null); setExporting(true); }}
          onDelete={() => { setPanel(null); setConfirmDelete(true); }}
        />
      </PageBar>

      <div className="editor-layout">
        {drawing && (
          <DrawingTools
            session={session}
            strokes={note.drawing}
            layers={note.drawingLayers}
            activeLayer={activeLayer}
            onActiveLayerChange={setChosenLayer}
            layerRef={drawingRef}
            onClose={() => setDrawingMode(false)}
            onOpenSettings={() => onOpenSettings('drawing')}
          />
        )}
        <main className={`editor-canvas ${geometry ? 'is-paginated' : ''}`} ref={canvasRef} onMouseDown={continueBelow}>
          {/* Zoom scales everything in the note, using the CSS zoom property (Small text lowers it */}
          {/* a little more, so drawings stay lined up with the text). A paginated note's */}
          {/* column is exactly one page wide, with the page margin as its padding, and as tall as */}
          {/* its pages; the sheets are drawn behind it. */}
          <div ref={frameRef} className={`editor-width ${geometry ? 'is-paginated' : ''}`} style={{ zoom: noteZoom, ...(geometry ? pageFrameStyle(geometry, pages) : {}) }}>
            {/* Printing uses the note's page size and margin. */}
            {geometry && active && (
              <style>{`@media print { @page { size: ${note.pageSize === 'a4' ? 'A4' : 'letter'} ${note.landscape ? 'landscape' : 'portrait'}; margin: 1in; } }`}</style>
            )}
            {geometry && (
              <div className="page-sheets" aria-hidden="true">
                {Array.from({ length: pages }, (_, index) => (
                  <div key={index} className="page-sheet" style={{ top: index * pageStep(geometry), height: geometry.height }}>
                    <span className="page-number">{index + 1}</span>
                  </div>
                ))}
              </div>
            )}
            <DrawingLayer strokes={note.drawing} layers={note.drawingLayers} inset={geometry?.margin ?? 0} layerRef={drawingRef} />
            <div className="editor-meta">
              <span className="page-type"><Icon name="file-text" size={14} /> DOCUMENT</span>
              <span className="meta-dot">•</span>
              <span>{updatedLabel(note)}</span>
            </div>
            <NoteHeader note={note} locked={locked} onOpenNote={onOpenNote} />
            <div className="article-rule" />

            {/* The key re-creates the editor after undo/redo or a mode change, so it shows the saved content. */}
            <div
              ref={contentRef}
              className={`note-content ${note.stickyIndicator ? '' : 'sticky-indicators-off'} ${switching ? 'is-switching' : ''}`}
              onAnimationEnd={() => setSwitching(false)}
            >
              {note.mode === 'continuous'
                ? <ContinuousEditor key={`continuous-${revision}`} session={session} content={note.content} locked={locked} />
                : <StructuredEditor key={`blocks-${revision}`} session={session} content={note.content} locked={locked} />}
              <CodeLanguagePickers session={session} containerRef={contentRef} locked={locked} />
              <CommentLayer session={session} comments={note.comments} containerRef={contentRef} />
            </div>
            {!geometry && <div className="document-end"><span /> END OF DOCUMENT <span /></div>}
          </div>
        </main>
      </div>

      <SelectionToolbar session={session} locked={locked} />
      <SlashMenu session={session} noteId={note.id} locked={locked} onOpenNewPage={onOpenNewPage} />
      <BlockWidgets session={session} locked={locked} onOpenNote={onOpenNote} />
      <LinkTools session={session} locked={locked} onOpenNote={onOpenNote} onOpenNoteInNewTab={onOpenNoteInNewTab} />
      <ImageTools session={session} locked={locked} />
      <TableTools session={session} locked={locked} />

      {exporting && <ExportDialog noteId={note.id} measure={measureForExport} onClose={() => setExporting(false)} />}

      {confirmDelete && <DeleteNoteDialog noteId={note.id} onConfirm={removeNote} onCancel={() => setConfirmDelete(false)} />}
    </div>
  );
}
