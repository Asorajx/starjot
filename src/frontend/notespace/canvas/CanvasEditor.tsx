import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { isShortcut } from '../../app/shortcuts';
import { Icon } from '../../components/Icon';
import type { OpenById } from '../../lib/clicks';
import { useDismiss } from '../../lib/useDismiss';
import { DeleteNoteDialog } from '../DeleteNoteDialog';
import { NoteColorStrip } from '../NoteColors';
import { PageBar, SaveStatus, type PageHistory } from '../PageBar';
import {
  deleteNote, flushSave, isLocked, isTemporarilyUnlocked, markOpened, scheduleSave, setPinned, UNTITLED_NOTE, updateNote, useCategories, useNote
} from '../store';
import { DrawingLayer } from '../editor/drawing/DrawingLayer';
import { DrawingTools } from '../editor/drawing/DrawingTools';
import { strokesBounds, TEXT_LAYER } from '../editor/drawing/drawing';
import { LockStatus } from '../editor/LockStatus';
import { NoteBreadcrumb } from '../editor/NoteBreadcrumb';
import { EditorSession, useSessionValue } from '../editor/session';
import type { SettingsSection } from '../../settings/Settings';
import { CanvasSettings } from './CanvasSettings';
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
  onOpenNoteInNewTab: (id: string) => void;
  onGoToNote: (id: string) => void;
  onOpenCategory: OpenById;
  onOpenSettings: (section: SettingsSection) => void;
};

/* How far one zoom button press (or key press) zooms. */
const ZOOM_STEP = 1.25;

/* Where a canvas starts: its first stroke's corner a little in from the top left, at 100%. */
const START_VIEW: CanvasView = { x: 48, y: 96, zoom: 1 };

/* Where each canvas was left, while Starjot is open, so coming back to it shows the same place. */
const lastViews = new Map<string, CanvasView>();

/* A canvas note: an endless space to draw on, with no page. Drag with the Hand tool, the middle */
/* mouse button or Space held down to move around, or scroll; Ctrl + scroll (or pinching a */
/* trackpad) zooms around the pointer. The drawing tools are always out, except on a locked */
/* canvas, which can only be looked around. Strokes are kept in the note's drawing, measured */
/* from the canvas's starting corner, so undo, layers and the eraser work as in documents. */
export function CanvasEditor({ noteId, history, active, onClose, onOpenNoteInNewTab, onGoToNote, onOpenCategory, onOpenSettings }: CanvasEditorProps) {
  const note = useNote(noteId);
  useCategories();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [view, setView] = useState<CanvasView>(() => lastViews.get(noteId) ?? START_VIEW);
  const [hand, setHand] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef<HTMLDivElement>(null);
  const pan = useRef<{ id: number; x: number; y: number } | null>(null);
  const latestView = useRef(view);
  latestView.current = view;
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

  const session = useMemo(() => new EditorSession(noteId, ''), [noteId]);
  const { canUndo, canRedo } = useSessionValue(session, snapshot => snapshot);
  useEffect(() => session.watch(), [session]);

  useEffect(() => {
    markOpened(noteId);
    return () => flushSave();
  }, [noteId]);

  useEffect(() => {
    lastViews.set(noteId, view);
  }, [noteId, view]);

  /* The size of the canvas on screen, for zooming around its middle and fitting the drawing in. */
  function viewSize() {
    const box = viewRef.current?.getBoundingClientRect();
    return { width: box?.width ?? 0, height: box?.height ?? 0, left: box?.left ?? 0, top: box?.top ?? 0 };
  }

  function zoomBy(factor: number) {
    const { width, height } = viewSize();
    setView(current => zoomAround(current, clampZoom(current.zoom * factor), width / 2, height / 2));
  }

  /* Fit the whole drawing in view (never past 100%), or go back to the start when it is empty. */
  function fitDrawing() {
    const { width, height } = viewSize();
    const hidden = new Set(note?.drawingLayers.filter(layer => layer.hidden).map(layer => layer.id));
    const bounds = strokesBounds((note?.drawing ?? []).filter(stroke => !stroke.layer || !hidden.has(stroke.layer)));
    setView(bounds ? fitView(bounds, width, height) : START_VIEW);
  }

  function resetZoom() {
    const { width, height } = viewSize();
    setView(current => zoomAround(current, 1, width / 2, height / 2));
  }

  /* Keyboard shortcuts: Escape leaves the canvas (once any open menu has closed); undo and redo; the zoom */
  /* keys zoom the canvas around its middle; Space held down moves around while dragging. */
  const actions = useRef({ zoomBy, resetZoom });
  actions.current = { zoomBy, resetZoom };
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
        onClose();
        return;
      }
      const zoomStep = isShortcut(event, 'zoomIn') ? 1 : isShortcut(event, 'zoomOut') ? -1 : isShortcut(event, 'zoomReset') ? 0 : null;
      if (zoomStep !== null) {
        event.preventDefault();
        if (zoomStep) actions.current.zoomBy(zoomStep > 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
        else actions.current.resetZoom();
        return;
      }
      if (command && (key === 'z' || key === 'y') && !typingIn(event.target)) {
        event.preventDefault();
        if (locked) return;
        if (key === 'y' || event.shiftKey) session.redo();
        else session.undo();
        return;
      }
      if (event.key === ' ' && !event.repeat && !typingIn(event.target)) {
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

  /* Dragging moves around the canvas with the Hand tool, with Space held down, with the middle */
  /* mouse button, or on a locked canvas. It is caught before the drawing tools see the press. */
  const grabbing = hand || spaceHeld || locked;
  function handlePointerDownCapture(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as Element).closest('.drawing-toolbar, .canvas-zoom, .canvas-title')) return;
    if (!(event.button === 1 || (event.button === 0 && grabbing))) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    pan.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    setPanning(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const current = pan.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    pan.current = { ...current, x: event.clientX, y: event.clientY };
    setView(shown => ({ ...shown, x: shown.x + dx, y: shown.y + dy }));
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (pan.current?.id !== event.pointerId) return;
    pan.current = null;
    setPanning(false);
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
        className={`canvas-view ${grabbing ? 'is-grabbing' : ''} ${panning ? 'is-panning' : ''}`}
        onPointerDownCapture={handlePointerDownCapture}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="canvas-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
          <DrawingLayer strokes={note.drawing} layers={note.drawingLayers} inset={0} layerRef={drawingRef} />
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
            canvas={{ hand, onHandChange: setHand }}
            onOpenSettings={() => onOpenSettings('drawing')}
          />
        )}

        <div className="canvas-zoom" role="group" aria-label="Canvas zoom">
          <button type="button" className="zoom-button" aria-label="Zoom out" data-tooltip="Zoom out" data-shortcut="Ctrl + −" onClick={() => zoomBy(1 / ZOOM_STEP)}><Icon name="minus" size={15} /></button>
          <button type="button" className="zoom-value" aria-label="Reset zoom to 100%" data-tooltip="Reset to 100%" data-shortcut="Ctrl + 0" onClick={resetZoom}>{Math.round(view.zoom * 100)}%</button>
          <button type="button" className="zoom-button" aria-label="Zoom in" data-tooltip="Zoom in" data-shortcut="Ctrl + =" onClick={() => zoomBy(ZOOM_STEP)}><Icon name="plus" size={15} /></button>
          <button type="button" className="zoom-button" aria-label="Fit the drawing in view" data-tooltip="Fit the drawing in view" onClick={fitDrawing}><Icon name="scan" size={15} /></button>
        </div>
      </div>

      {confirmDelete && <DeleteNoteDialog noteId={note.id} onConfirm={removeNote} onCancel={() => setConfirmDelete(false)} />}
    </div>
  );
}
