import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { Icon } from '../../components/Icon';
import type { DrawingStroke } from '../../../shared/types/note';
import { anchorDrawing, anchoredBox, detachDrawing, moveDrawing, selectedStrokes, takeStrokes, textTop, type SelectEdge } from './anchoring';
import type { Box } from './drawing';
import type { EditorSession } from './session';

/* A box smaller than this (in pixels) counts as a click, not a selection. */
const MIN_BOX = 4;

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type Handle = (typeof HANDLES)[number];

/* An anchored drawing keeps its shape, so only its corners resize it. */
const CORNERS: Handle[] = ['nw', 'ne', 'se', 'sw'];

type Selection = {
  box: Box;

  /* The anchored drawing that is selected, or null when the box selects loose strokes. */
  anchored: HTMLElement | null;
};

type Drag = {
  kind: Handle | 'move' | 'new';
  startX: number;
  startY: number;
  startBox: Box;
};

type DrawingSelectionProps = {
  session: EditorSession;
  strokes: DrawingStroke[];
  layerRef: RefObject<HTMLDivElement | null>;
  edge: SelectEdge;
  snap: boolean;
};


/* =========================
   Box Shapes
   ========================= */

function boxBetween(x1: number, y1: number, x2: number, y2: number): Box {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

/* The box after dragging one of its handles by dx, dy. Dragging past the opposite side flips it. */
/* With keepShape, the box keeps its proportions and the opposite corner stays where it is. */
function resizeBox(box: Box, handle: Handle, dx: number, dy: number, keepShape: boolean): Box {
  if (keepShape) {
    const left = handle.includes('w');
    const top = handle.includes('n');
    const width = Math.max(MIN_BOX, box.width + (left ? -dx : dx));
    const height = width * (box.height / box.width);
    return { x: left ? box.x + box.width - width : box.x, y: top ? box.y + box.height - height : box.y, width, height };
  }
  let [left, top, right, bottom] = [box.x, box.y, box.x + box.width, box.y + box.height];
  if (handle.includes('w')) left += dx;
  if (handle.includes('e')) right += dx;
  if (handle.includes('n')) top += dy;
  if (handle.includes('s')) bottom += dy;
  return boxBetween(left, top, right, bottom);
}


/* =========================
   Drawing Selection
   ========================= */

/* The Select tool of drawing mode. Dragging draws a box around loose strokes; it stays after */
/* letting go, with handles to resize it and the inside to move it, and the strokes it takes glow. */
/* Anchor (or Enter) anchors them into the text. Clicking an anchored drawing selects it: drag it */
/* to move it, drag a corner to resize it, or Detach it into loose strokes (which stay selected, */
/* so more strokes can be taken in before anchoring again). Escape or a click outside closes the box. */
export function DrawingSelection({ session, strokes, layerRef, edge, snap }: DrawingSelectionProps) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [, setTick] = useState(0);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const latest = useRef(selection);
  latest.current = selection;

  /* The layer's place and zoom, to change between screen and drawing coordinates. */
  function frame() {
    const layer = layerRef.current;
    if (!layer) return null;
    const rect = layer.getBoundingClientRect();
    return { rect, scale: rect.width / (layer.offsetWidth || rect.width) || 1 };
  }

  function position(event: { clientX: number; clientY: number }) {
    const current = frame();
    return current ? { x: (event.clientX - current.rect.left) / current.scale, y: (event.clientY - current.rect.top) / current.scale } : null;
  }

  /* Select an anchored drawing, with the box exactly around it. */
  function selectAnchored(block: HTMLElement) {
    const box = anchoredBox(session, block);
    setSelection(box ? { box, anchored: block } : null);
  }

  function anchor() {
    const current = latest.current;
    if (!current || current.anchored) return;
    const block = anchorDrawing(session, current.box, { edge, snap, blockers: [surfaceRef.current] });
    if (block) selectAnchored(block);
  }

  function detach() {
    const current = latest.current;
    if (!current?.anchored) return;
    const box = detachDrawing(session, current.anchored);
    setSelection(box ? { box, anchored: null } : null);
  }

  function remove() {
    const current = latest.current;
    if (!current) return;
    if (current.anchored) {
      session.checkpoint();
      current.anchored.remove();
      session.commit();
    } else {
      const { taken, left } = takeStrokes(strokes, current.box, edge);
      if (taken.length) session.saveDrawing(left);
    }
    setSelection(null);
  }

  /* Enter anchors, Escape closes and Delete removes. Listening early (capture) keeps Escape from */
  /* also leaving drawing mode. */
  const actions = useRef({ anchor, remove });
  actions.current = { anchor, remove };
  useEffect(() => {
    if (!selection) return;
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.target as Element).closest?.('input, textarea')) return;
      const action = event.key === 'Escape' ? () => setSelection(null)
        : event.key === 'Enter' ? actions.current.anchor
          : event.key === 'Delete' || event.key === 'Backspace' ? actions.current.remove : null;
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      action();
    }
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [selection]);

  /* The loose strokes the box takes glow. */
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.querySelectorAll('[data-selected]').forEach(path => path.removeAttribute('data-selected'));
    if (!selection || selection.anchored) return;
    selectedStrokes(strokes, selection.box, edge).forEach(index => layer.querySelector(`[data-stroke="${index}"]`)?.setAttribute('data-selected', ''));
  });

  /* Undo or a mode change redraws the note, which removes a selected anchored drawing. */
  useEffect(() => {
    if (selection?.anchored && !selection.anchored.isConnected) setSelection(null);
  });

  /* The box is drawn on the surface, so it moves when the page is resized or zoomed. */
  useEffect(() => {
    const redraw = () => setTick(tick => tick + 1);
    window.addEventListener('resize', redraw);
    return () => window.removeEventListener('resize', redraw);
  }, []);

  /* An anchored drawing in this note's text under the pointer, if any. */
  function anchoredAt(x: number, y: number) {
    const body = session.body();
    const found = document.elementsFromPoint(x, y).find(element => element.classList.contains('drawing-block'));
    return found instanceof HTMLElement && body?.contains(found) ? found : null;
  }

  /* While an anchored drawing is moved or resized, it follows the box without the text moving; */
  /* it is anchored again when the drag ends. */
  function preview(block: HTMLElement, from: Box, to: Box) {
    block.style.transformOrigin = '0 0';
    block.style.transform = `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(${to.width / from.width})`;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const at = position(event);
    const target = event.target as Element;
    if (!at || target.closest('.drawing-selection-bar')) return;
    event.preventDefault();
    const current = latest.current;
    const handle = target.closest('[data-handle]')?.getAttribute('data-handle') as Handle | null;

    if (current && (handle || target.closest('.drawing-selection-box'))) {
      drag.current = { kind: handle ?? 'move', startX: at.x, startY: at.y, startBox: current.box };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    /* A click outside the box closes it; a click on an anchored drawing selects that drawing, */
    /* ready to be dragged straight away. */
    const block = anchoredAt(event.clientX, event.clientY);
    if (block) {
      const box = anchoredBox(session, block);
      if (!box) return;
      setSelection({ box, anchored: block });
      drag.current = { kind: 'move', startX: at.x, startY: at.y, startBox: box };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    const box = { x: at.x, y: at.y, width: 0, height: 0 };
    drag.current = { kind: 'new', startX: at.x, startY: at.y, startBox: box };
    setSelection({ box, anchored: null });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current;
    const at = current && position(event);
    const anchored = latest.current?.anchored ?? null;
    if (!current || !at) return;
    const dx = at.x - current.startX;
    const dy = at.y - current.startY;
    const { startBox } = current;
    let box = current.kind === 'new' ? boxBetween(current.startX, current.startY, at.x, at.y)
      : current.kind === 'move' ? { ...startBox, x: startBox.x + dx, y: startBox.y + dy }
        : resizeBox(startBox, current.kind, dx, dy, Boolean(anchored));

    /* An anchored drawing stops at the top of the text: moving keeps it just below the details, */
    /* and a resize that would reach above it is not made. */
    const top = anchored ? textTop(session) : null;
    if (top !== null && box.y < top) {
      if (current.kind !== 'move') return;
      box = { ...box, y: top };
    }
    if (anchored) preview(anchored, startBox, box);
    setSelection(selection => (selection ? { ...selection, box } : selection));
  }

  function handlePointerUp() {
    const current = drag.current;
    drag.current = null;
    const selected = latest.current;
    if (current?.kind === 'new' && selected && selected.box.width < MIN_BOX && selected.box.height < MIN_BOX) setSelection(null);

    /* A moved or resized anchored drawing is anchored again where it was dropped. */
    const block = selected?.anchored;
    if (current && block) {
      const { box } = selected;
      const changed = Math.abs(box.x - current.startBox.x) + Math.abs(box.y - current.startBox.y) + Math.abs(box.width - current.startBox.width) > 1;
      block.style.removeProperty('transform');
      if (changed && moveDrawing(session, block, box, snap, [surfaceRef.current])) selectAnchored(block);
    }

    /* Show the box's buttons again, now that the drag is over. */
    setTick(tick => tick + 1);
  }

  /* Where the box is drawn on the surface. */
  const current = frame();
  const surface = surfaceRef.current?.getBoundingClientRect();
  const shown = selection && current && surface ? {
    left: current.rect.left - surface.left + selection.box.x * current.scale,
    top: current.rect.top - surface.top + selection.box.y * current.scale,
    width: selection.box.width * current.scale,
    height: selection.box.height * current.scale
  } : null;

  /* The buttons line up with the box's right edge when the box is on the right, so they stay on the page. */
  const barAtEnd = Boolean(shown && surface && shown.left + shown.width / 2 > surface.width / 2);
  const hasStrokes = selection ? Boolean(selection.anchored) || selectedStrokes(strokes, selection.box, edge).length > 0 : false;
  const dragging = drag.current !== null;
  const handles = selection?.anchored ? CORNERS : HANDLES;

  return (
    <div
      ref={surfaceRef}
      className="drawing-surface is-select"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {shown && selection && (
        <div className={`drawing-selection-box ${selection.anchored ? 'is-anchored' : ''}`} style={shown}>
          {handles.map(handle => <span key={handle} className={`drawing-selection-handle is-${handle}`} data-handle={handle} />)}
          {!dragging && selection.box.width >= MIN_BOX && (
            <div className={`drawing-selection-bar ${barAtEnd ? 'is-end' : ''}`} role="toolbar" aria-label="Selection">
              {selection.anchored ? (
                <button type="button" className="btn btn-sm btn-secondary" onClick={detach}>
                  <Icon name="box-select" size={14} /> Detach
                </button>
              ) : (
                <button type="button" className="btn btn-sm btn-primary" disabled={!hasStrokes} onClick={anchor}>
                  <Icon name="paperclip" size={14} /> Anchor
                </button>
              )}
              <button type="button" className="page-bar-button" data-tooltip="Delete" aria-label="Delete" disabled={!hasStrokes} onClick={remove}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
