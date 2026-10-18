import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { isShortcut } from '../../app/shortcuts';
import { usePreferences } from '../../app/preferences';
import { Icon } from '../../components/Icon';
import { opensNewTab, type OpenById } from '../../lib/clicks';
import { useDismiss } from '../../lib/useDismiss';
import { DeleteNoteDialog } from '../DeleteNoteDialog';
import { NoteColorStrip } from '../NoteColors';
import { PageBar, SaveStatus, type PageHistory } from '../PageBar';
import { safeHref } from '../sanitize';
import {
  deleteNote, flushSave, getNote, isLocked, isTemporarilyUnlocked, markOpened, scheduleSave, setPinned, UNTITLED_NOTE, updateNote, useCategories, useNote
} from '../store';
import { DrawingLayer } from '../editor/drawing/DrawingLayer';
import { DrawingTools, type CanvasTool } from '../editor/drawing/DrawingTools';
import { joinBoxes, strokesBounds, TEXT_LAYER, type Box } from '../editor/drawing/drawing';
import { LockStatus } from '../editor/LockStatus';
import { NoteBreadcrumb } from '../editor/NoteBreadcrumb';
import { EditorSession, useSessionValue } from '../editor/session';
import { SelectionToolbar } from '../editor/format/SelectionToolbar';
import { SlashMenu } from '../editor/text/SlashMenu';
import { BlockWidgets } from '../editor/text/BlockWidgets';
import { LinkTools } from '../editor/links/LinkTools';
import { ImageTools } from '../editor/images/ImageTools';
import { TableTools } from '../editor/tables/TableTools';
import type { SettingsSection } from '../../settings/Settings';
import { CanvasSettings } from './CanvasSettings';
import { CanvasBoxes, type BoxDrag, type EditingBox } from './CanvasBoxes';
import { BOX_WIDTH, boxWidth, isEmptyBox, newBoxId, readBoxes, removeBox, writeBox, type CanvasBox } from './boxes';
import { clampZoom, fitView, zoomAround, type CanvasView } from './view';


/* =========================
   Canvas Editor
   ========================= */

type CanvasEditorProps = {
  noteId: string;
  history: PageHistory;

  /* True for the active tab of the focused group; only it answers keyboard shortcuts. */
  active: boolean;
  onClose: () => void;
  onOpenNote: OpenById;
  onOpenNoteInNewTab: (id: string) => void;
  onGoToNote: (id: string) => void;
  onOpenCategory: OpenById;

  /* Opens a sub-note just added in a text box with the slash menu, ready to be named. */
  onOpenNewPage: (id: string) => void;
  onOpenSettings: (section: SettingsSection) => void;
};

/* How far one zoom button press (or key press) zooms. */
const ZOOM_STEP = 1.25;

/* Where a canvas starts: its first stroke's corner a little in from the top left, at 100%. */
const START_VIEW: CanvasView = { x: 48, y: 96, zoom: 1 };

/* How far the pointer may move (in screen pixels) for a press to still count as a click. */
const CLICK_SLOP = 3;

/* A new text box starts this far above the click, so its first line is where you clicked. */
const BOX_NUDGE = 12;

/* Where each canvas was left, while Starjot is open, so coming back to it shows the same place. */
const lastViews = new Map<string, CanvasView>();

/* Note links (cards and inline links) and web links inside a text box that is not being written in. */
const LINKS = '.canvas-box .page-block[data-page], .canvas-box .page-mention[data-page], .canvas-box a[data-page], .canvas-box a[href]';

type Gesture =
  | { kind: 'pan'; id: number; x: number; y: number; moved: boolean; link: HTMLElement | null }
  | { kind: 'box'; id: number; box: CanvasBox; resize: boolean; startX: number; startY: number; moved: boolean; link: HTMLElement | null };

/* A canvas note: an endless space to draw and write on, with no page. Drag with the Hand tool, */
/* the middle mouse button or Space held down to move around, or scroll; Ctrl + scroll (or */
/* pinching a trackpad) zooms around the pointer. The drawing tools are always out, except on a */
/* locked canvas, which can only be looked around (and its links followed). Strokes are kept in */
/* the note's drawing and text boxes in its content (see boxes.ts), both measured from the */
/* canvas's starting corner, so undo, search and links work as in documents. */
export function CanvasEditor({ noteId, history, active, onClose, onOpenNote, onOpenNoteInNewTab, onGoToNote, onOpenCategory, onOpenNewPage, onOpenSettings }: CanvasEditorProps) {
  const note = useNote(noteId);
  useCategories();
  const { drawing: drawingSettings } = usePreferences();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [view, setView] = useState<CanvasView>(() => lastViews.get(noteId) ?? START_VIEW);
  const [canvasTool, setCanvasTool] = useState<CanvasTool | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const [editing, setEditing] = useState<EditingBox | null>(null);
  const [selectedBox, setSelectedBox] = useState<string | null>(null);
  const [boxDrag, setBoxDrag] = useState<BoxDrag | null>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const panelId = useId();

  /* Clicking outside the settings, or Escape, closes them. */
  useDismiss(settingsOpen, '.editor-flyout, [data-panel-toggle]', () => setSettingsOpen(false));

  const temporary = note ? isTemporarilyUnlocked(note) : false;
  const locked = note ? isLocked(note) : false;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!temporary) return;
    const timer = window.setInterval(() => setTick(tick => tick + 1), 5000);
    return () => window.clearInterval(timer);
  }, [temporary]);

  const [chosenLayer, setChosenLayer] = useState('');
  const drawingLayers = note?.drawingLayers.filter(layer => layer.id !== TEXT_LAYER) ?? [];
  const activeLayer = drawingLayers.some(layer => layer.id === chosenLayer) ? chosenLayer : drawingLayers.at(-1)?.id ?? '';

  const session = useMemo(() => new EditorSession(noteId, getNote(noteId)?.content ?? ''), [noteId]);
  const { canUndo, canRedo, revision } = useSessionValue(session, snapshot => snapshot);
  useEffect(() => session.watch(), [session]);

  const content = note?.content ?? '';
  const boxes = useMemo(() => readBoxes(content), [content]);

  /* Text boxes take the pointer (over the drawing tools' surface) with Select, Text and the Hand, */
  /* and on a locked canvas; with a pen, highlighter or eraser the pointer draws over them. */
  const selecting = !canvasTool && drawingSettings.tool === 'select';
  const boxesOnTop = locked || canvasTool !== null || selecting;

  useEffect(() => {
    markOpened(noteId);
    return () => flushSave();
  }, [noteId]);

  useEffect(() => {
    lastViews.set(noteId, view);
  }, [noteId, view]);


  /* True once the box being written in has been saved into the content. */
  const boxSaved = useRef(false);
  const editingRef = useRef(editing);
  editingRef.current = editing;

  /* Start writing in a box (a new one is added to the content when something is typed). The */
  /* session's frame puts the box's lines back in its place in the whole content on every save. */
  function startEditing(box: Omit<EditingBox, 'caretAt'>, caretAt: EditingBox['caretAt']) {
    if (locked) return;
    setSelectedBox(null);
    boxSaved.current = boxes.some(item => item.id === box.id);
    session.setFrame(inner => {
      const latest = getNote(noteId)?.content ?? '';
      const saved = readBoxes(latest).find(item => item.id === box.id);
      boxSaved.current = true;
      return writeBox(latest, saved ?? box, inner);
    });
    setEditing({ ...box, caretAt });
  }

  /* Stop writing: the editor goes and the box reads as plain words again. A box left with nothing */
  /* in it is removed (one undo step). With select, the box stays selected (after Escape). */
  function finishEditing(select = false) {
    const current = editingRef.current;
    if (!current) return;
    session.setFrame(null);
    setEditing(null);
    window.getSelection()?.removeAllRanges();
    const latest = getNote(noteId)?.content ?? '';
    const saved = readBoxes(latest).find(item => item.id === current.id);
    if (saved && isEmptyBox(saved.html)) session.replaceContent(removeBox(latest, saved.id));
    else if (saved && select) setSelectedBox(saved.id);
  }

  /* Undo can take away the box being written in; writing then stops. */
  useEffect(() => {
    if (editing && boxSaved.current && !boxes.some(box => box.id === editing.id)) {
      session.setFrame(null);
      setEditing(null);
    }
    if (selectedBox && !boxes.some(box => box.id === selectedBox)) setSelectedBox(null);
  }, [boxes, editing, selectedBox, session, revision]);

  /* Picking up a pen (or locking the canvas) ends writing and selecting boxes. */
  const finishRef = useRef(finishEditing);
  finishRef.current = finishEditing;
  useEffect(() => {
    if (boxesOnTop && !locked) return;
    finishRef.current();
    setSelectedBox(null);
  }, [boxesOnTop, locked]);

  /* Leaving the canvas stops writing, so the frame never outlives it. */
  useEffect(() => () => session.setFrame(null), [session]);

  function removeSelectedBox() {
    if (!selectedBox) return;
    session.replaceContent(removeBox(getNote(noteId)?.content ?? '', selectedBox));
    setSelectedBox(null);
  }

  /* A point on screen as a place on the canvas. */
  function canvasPoint(clientX: number, clientY: number) {
    const box = viewRef.current?.getBoundingClientRect();
    return { x: (clientX - (box?.left ?? 0) - view.x) / view.zoom, y: (clientY - (box?.top ?? 0) - view.y) / view.zoom };
  }

  /* A note link opens the note (Ctrl + click in a new tab); a web link opens in the browser. */
  function followLink(link: HTMLElement, event: { ctrlKey: boolean; metaKey: boolean }) {
    const page = link.dataset.page;
    if (page) {
      onOpenNote(page, opensNewTab(event));
      return;
    }
    const href = safeHref(link.getAttribute('href'));
    if (href) window.open(href, '_blank', 'noopener');
  }


  /* The size of the canvas on screen, for zooming around its middle and fitting the drawing in. */
  function viewSize() {
    const box = viewRef.current?.getBoundingClientRect();
    return { width: box?.width ?? 0, height: box?.height ?? 0 };
  }

  function zoomBy(factor: number) {
    const { width, height } = viewSize();
    setView(current => zoomAround(current, clampZoom(current.zoom * factor), width / 2, height / 2));
  }

  /* Fit the whole drawing and every text box in view (never past 100%), or go back to the start */
  /* when the canvas is empty. Boxes are measured as laid out, before the canvas's zoom. */
  function fitDrawing() {
    const { width, height } = viewSize();
    const hidden = new Set(note?.drawingLayers.filter(layer => layer.hidden).map(layer => layer.id));
    let bounds = strokesBounds((note?.drawing ?? []).filter(stroke => !stroke.layer || !hidden.has(stroke.layer)));
    viewRef.current?.querySelectorAll<HTMLElement>('.canvas-box').forEach(element => {
      const box: Box = { x: element.offsetLeft, y: element.offsetTop, width: element.offsetWidth, height: element.offsetHeight };
      bounds = bounds ? joinBoxes(box, bounds) : box;
    });
    setView(bounds ? fitView(bounds, width, height) : START_VIEW);
  }

  function resetZoom() {
    const { width, height } = viewSize();
    setView(current => zoomAround(current, 1, width / 2, height / 2));
  }

  /* Keyboard shortcuts: Escape stops writing in a box, then lets go of a selected box, then leaves */
  /* the canvas (once any open menu has closed); Enter writes in the selected box and Delete */
  /* removes it; undo and redo; the zoom keys zoom around the middle; Space held down moves */
  /* around while dragging. */
  const actions = useRef({ zoomBy, resetZoom, finishEditing, removeSelectedBox, startEditing });
  actions.current = { zoomBy, resetZoom, finishEditing, removeSelectedBox, startEditing };
  const selectedRef = useRef<CanvasBox | null>(null);
  selectedRef.current = boxes.find(box => box.id === selectedBox) ?? null;
  useEffect(() => {
    function typingIn(target: EventTarget | null) {
      return Boolean((target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"]'));
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (!active || event.defaultPrevented || event.isComposing) return;
      const key = event.key.toLowerCase();
      const command = (event.ctrlKey || event.metaKey) && !event.altKey;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (editingRef.current) actions.current.finishEditing(true);
        else if (selectedRef.current) setSelectedBox(null);
        else onClose();
        return;
      }
      const zoomStep = isShortcut(event, 'zoomIn') ? 1 : isShortcut(event, 'zoomOut') ? -1 : isShortcut(event, 'zoomReset') ? 0 : null;
      if (zoomStep !== null) {
        event.preventDefault();
        if (zoomStep) actions.current.zoomBy(zoomStep > 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
        else actions.current.resetZoom();
        return;
      }
      if (typingIn(event.target)) return;
      if (command && (key === 'z' || key === 'y')) {
        event.preventDefault();
        if (locked) return;
        if (key === 'y' || event.shiftKey) session.redo();
        else session.undo();
        return;
      }
      const selected = selectedRef.current;
      if (selected && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        actions.current.removeSelectedBox();
        return;
      }
      if (selected && event.key === 'Enter') {
        event.preventDefault();
        actions.current.startEditing(selected, null);
        return;
      }
      if (event.key === ' ' && !event.repeat) {
        event.preventDefault();
        setSpaceHeld(true);
      }
    }
    function handleKeyUp(event: KeyboardEvent) {
      if (event.key === ' ') setSpaceHeld(false);
    }
    const release = () => setSpaceHeld(false);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', release);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', release);
    };
  }, [active, session, onClose, locked]);

  /* Scrolling moves around the canvas (Shift + scroll sideways); Ctrl + scroll, which is also what */
  /* a trackpad pinch sends, zooms around the pointer. The listener is not passive, so the page */
  /* itself does not scroll or zoom. */
  useEffect(() => {
    const element = viewRef.current;
    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      const lines = event.deltaMode === 1 ? 16 : 1;
      if (event.ctrlKey || event.metaKey) {
        const box = element?.getBoundingClientRect();
        if (!box) return;
        setView(current => zoomAround(current, clampZoom(current.zoom * Math.exp(-event.deltaY * lines * 0.002)), event.clientX - box.left, event.clientY - box.top));
        return;
      }
      const dx = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
      const dy = event.shiftKey && !event.deltaX ? 0 : event.deltaY;
      setView(current => ({ ...current, x: current.x - dx * lines, y: current.y - dy * lines }));
    }
    element?.addEventListener('wheel', handleWheel, { passive: false });
    return () => element?.removeEventListener('wheel', handleWheel);
  }, [note?.kind]);


  /* Presses are caught before the drawing tools see them. Moving around comes first (the Hand, */
  /* Space, the middle button, or a locked canvas); a press outside the box being written in stops */
  /* writing; then Text writes in the box pressed (or adds one there), and Select picks up the box */
  /* pressed to move it, or by its handle to widen it. A press that does not move on a link in a */
  /* box follows the link. */
  const grabbing = canvasTool === 'hand' || spaceHeld || locked;
  function handlePointerDownCapture(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target as Element;
    if (target.closest('.drawing-toolbar, .canvas-zoom, .canvas-title, .drawing-selection-bar')) return;
    if (target.closest('.canvas-box.is-editing')) return;
    const link = target.closest<HTMLElement>(LINKS);

    if (event.button === 1 || (event.button === 0 && grabbing)) {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = { kind: 'pan', id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, link };
      setPanning(true);
      return;
    }
    if (event.button !== 0) return;
    if (editingRef.current) finishEditing();

    const element = target.closest<HTMLElement>('.canvas-box[data-box]');
    const box = element ? boxes.find(item => item.id === element.dataset.box) ?? null : null;
    if (canvasTool === 'text') {
      event.preventDefault();
      event.stopPropagation();
      if (box) startEditing(box, { x: event.clientX, y: event.clientY });
      else {
        const at = canvasPoint(event.clientX, event.clientY);
        startEditing({ id: newBoxId(), x: at.x, y: at.y - BOX_NUDGE, width: BOX_WIDTH }, null);
      }
      return;
    }
    if (selecting && box && !target.closest('.drawing-selection-box')) {
      event.preventDefault();
      event.stopPropagation();
      setSelectedBox(box.id);
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = { kind: 'box', id: event.pointerId, box, resize: Boolean(target.closest('[data-box-resize]')), startX: event.clientX, startY: event.clientY, moved: false, link };
      return;
    }
    if (selectedBox) setSelectedBox(null);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    if (current.kind === 'pan') {
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      gesture.current = { ...current, x: event.clientX, y: event.clientY, moved: current.moved || Math.hypot(dx, dy) > 0 };
      setView(shown => ({ ...shown, x: shown.x + dx, y: shown.y + dy }));
      return;
    }
    const screenX = event.clientX - current.startX;
    const screenY = event.clientY - current.startY;
    if (!current.moved && Math.hypot(screenX, screenY) <= CLICK_SLOP) return;
    current.moved = true;
    const dx = screenX / view.zoom;
    const dy = screenY / view.zoom;
    setBoxDrag(current.resize
      ? { id: current.box.id, dx: 0, dy: 0, width: boxWidth(current.box.width + dx) }
      : { id: current.box.id, dx, dy, width: current.box.width });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    gesture.current = null;
    if (current.kind === 'pan') {
      setPanning(false);
      if (!current.moved && current.link && event.type === 'pointerup') followLink(current.link, event);
      return;
    }
    const moved = boxDrag?.id === current.box.id ? boxDrag : null;
    setBoxDrag(null);
    if (current.moved && moved && event.type === 'pointerup') {
      const { box } = current;
      session.replaceContent(writeBox(getNote(noteId)?.content ?? '', { ...box, x: box.x + moved.dx, y: box.y + moved.dy, width: moved.width }));
    } else if (!current.moved && current.link && event.type === 'pointerup') {
      followLink(current.link, event);
    }
  }

  /* Double-clicking a box with Select writes in it. */
  function handleDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    const element = (event.target as Element).closest<HTMLElement>('.canvas-box[data-box]:not(.is-editing)');
    const box = element ? boxes.find(item => item.id === element.dataset.box) : null;
    if (box && selecting) startEditing(box, { x: event.clientX, y: event.clientY });
  }

  /* The dots behind the drawing move and grow with it, so moving around can be seen. */
  useLayoutEffect(() => {
    const element = viewRef.current;
    if (!element) return;
    const gap = 24 * view.zoom;
    element.style.backgroundSize = `${gap}px ${gap}px`;
    element.style.backgroundPosition = `${view.x}px ${view.y}px`;
  }, [view]);

  if (!note) return <p className="content-pad">This note is no longer available.</p>;

  function removeNote(withSubNotes: boolean) {
    setConfirmDelete(false);
    deleteNote(noteId, withSubNotes);
    onClose();
  }

  const keepSelection = (event: ReactMouseEvent) => event.preventDefault();
  const viewClasses = [
    'canvas-view',
    grabbing ? 'is-grabbing' : '',
    panning ? 'is-panning' : '',
    boxesOnTop || editing ? 'is-boxes' : '',
    canvasTool === 'text' ? 'is-text' : '',
    selecting ? 'is-selecting' : ''
  ].filter(Boolean).join(' ');

  return (
    <div className={`editor-wrap canvas-wrap ${locked ? 'is-locked' : ''} ${note.color ? 'has-color' : ''}`}>
      <NoteColorStrip color={note.color} />
      <PageBar history={history} className="editor-page-bar">
        <NoteBreadcrumb note={note} onOpenNote={(id, inNewTab) => (inNewTab ? onOpenNoteInNewTab(id) : onGoToNote(id))} onOpenCategory={onOpenCategory} />
        <span className="page-bar-fill" />
        <SaveStatus />

        <span className="page-bar-group" role="group" aria-label="Undo and redo">
          <button type="button" className="page-bar-button" data-tooltip="Undo" data-shortcut="Ctrl + Z" aria-label="Undo" disabled={!canUndo || locked} onMouseDown={keepSelection} onClick={() => session.undo()}>
            <Icon name="undo" size={17} />
          </button>
          <button type="button" className="page-bar-button" data-tooltip="Redo" data-shortcut="Ctrl + Y" aria-label="Redo" disabled={!canRedo || locked} onMouseDown={keepSelection} onClick={() => session.redo()}>
            <Icon name="redo" size={17} />
          </button>
        </span>

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

        <button
          type="button"
          data-panel-toggle
          data-tooltip-align="end"
          className={`page-bar-button ${settingsOpen ? 'selected' : ''}`}
          data-tooltip={settingsOpen ? undefined : 'Canvas settings'}
          aria-label="Canvas settings"
          aria-expanded={settingsOpen}
          aria-controls={`${panelId}-settings`}
          onClick={() => setSettingsOpen(open => !open)}
        >
          <Icon name="sliders-horizontal" size={17} />
        </button>

        <CanvasSettings
          id={`${panelId}-settings`}
          note={note}
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onDelete={() => { setSettingsOpen(false); setConfirmDelete(true); }}
        />
      </PageBar>

      <div
        ref={viewRef}
        className={viewClasses}
        onPointerDownCapture={handlePointerDownCapture}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        <div className="canvas-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
          <DrawingLayer strokes={note.drawing} layers={note.drawingLayers} inset={0} layerRef={drawingRef} />
          <CanvasBoxes boxes={boxes} editing={editing} selected={selectedBox} drag={boxDrag} session={session} revision={revision} />
        </div>

        <input
          className="note-title-input canvas-title"
          type="text"
          aria-label="Canvas title"
          maxLength={160}
          placeholder={UNTITLED_NOTE}
          autoComplete="off"
          readOnly={locked}
          value={note.title}
          onChange={event => {
            updateNote(note.id, { title: event.target.value }, false);
            scheduleSave();
          }}
          onKeyDown={event => event.key === 'Enter' && event.currentTarget.blur()}
        />

        {!locked && (
          <DrawingTools
            session={session}
            strokes={note.drawing}
            layers={note.drawingLayers}
            activeLayer={activeLayer}
            onActiveLayerChange={setChosenLayer}
            layerRef={drawingRef}
            canvas={{ tool: canvasTool, onToolChange: setCanvasTool }}
            onOpenSettings={() => onOpenSettings('drawing')}
          />
        )}

        <div className="canvas-zoom" role="group" aria-label="Canvas zoom">
          <button type="button" className="zoom-button" aria-label="Zoom out" data-tooltip="Zoom out" data-shortcut="Ctrl + −" onClick={() => zoomBy(1 / ZOOM_STEP)}><Icon name="minus" size={15} /></button>
          <button type="button" className="zoom-value" aria-label="Reset zoom to 100%" data-tooltip="Reset to 100%" data-shortcut="Ctrl + 0" onClick={resetZoom}>{Math.round(view.zoom * 100)}%</button>
          <button type="button" className="zoom-button" aria-label="Zoom in" data-tooltip="Zoom in" data-shortcut="Ctrl + =" onClick={() => zoomBy(ZOOM_STEP)}><Icon name="plus" size={15} /></button>
          <button type="button" className="zoom-button" aria-label="Fit everything in view" data-tooltip="Fit everything in view" onClick={fitDrawing}><Icon name="scan" size={15} /></button>
        </div>
      </div>

      {/* The text tools of the box being written in, as in a document. */}
      <SelectionToolbar session={session} locked={locked} />
      <SlashMenu session={session} noteId={note.id} locked={locked} onOpenNewPage={onOpenNewPage} />
      <BlockWidgets session={session} locked={locked} onOpenNote={onOpenNote} onOpenNoteInNewTab={onOpenNoteInNewTab} />
      <LinkTools session={session} locked={locked} onOpenNote={onOpenNote} onOpenNoteInNewTab={onOpenNoteInNewTab} />
      <ImageTools session={session} locked={locked} />
      <TableTools session={session} locked={locked} />

      {confirmDelete && <DeleteNoteDialog noteId={note.id} onConfirm={removeNote} onCancel={() => setConfirmDelete(false)} />}
    </div>
  );
}
