import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { Icon } from '../../../components/Icon';
import type { DrawingStroke } from '../../../../shared/types/note';
import { anchorDrawing, anchoredBox, detachDrawing, moveDrawing, selectedStrokes, takeStrokes, textTop, type SelectEdge, type StrokeFilter } from './anchoring';
import { strokeElements } from './DrawingLayer';
import { connectedStrokes, moveStrokes, strokesBounds, touchesStroke, type Box } from './drawing';
import { DRAWING_WRAPS, drawingInk, drawingWrap, type DrawingWrap } from '../images/images';
import type { EditorSession } from '../session';
import { zoomed } from '../../../lib/geometry';

/* A box smaller than this (in pixels) counts as a click, not a selection. */
const MIN_BOX = 4;

/* How far a double-click may be from a stroke to pick it, in pixels at 100% zoom. */
const PICK_REACH = 4;

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type Handle = (typeof HANDLES)[number];

/* An anchored drawing keeps its shape, so only its corners resize it. */
const CORNERS: Handle[] = ['nw', 'ne', 'se', 'sw'];

type Selection = {
  box: Box;

  /* The anchored drawing that is selected, or null when the box selects loose strokes. */
  anchored: HTMLElement | null;

  /* Strokes picked by double-clicking (a stroke and every stroke touching it). They are taken */
  /* exactly, whatever else is inside their box, and the box fits them with no space around. */
  picked: number[] | null;
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

  /* How new anchored drawings sit with the text (remembered between drawings). */
  wrap: DrawingWrap;
  onWrapChange: (wrap: DrawingWrap) => void;

  /* The layer being worked on: only its strokes can be selected, and detached strokes go onto it. */
  layer: string;
  allowed: StrokeFilter;
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

function shifted(box: Box, dx: number, dy: number) {
  return { ...box, x: box.x + dx, y: box.y + dy };
}


/* =========================
   Drawing Selection
   ========================= */

/* The Select tool of drawing mode. Dragging draws a box around loose strokes; it stays after */
/* letting go, with handles to resize it and the inside to move it, and the strokes it takes glow. */
/* Double-clicking a stroke picks it and every stroke touching it, with the box fitted exactly. */
/* Anchor (or Enter) anchors them into the text, wrapped or in front of it. Clicking an anchored */
/* drawing selects it: drag it to move it, drag a corner to resize it, or Detach it into loose */
/* strokes (which stay selected, so more strokes can be taken in before anchoring again). The */
/* arrow keys move what is selected by a pixel (ten with Shift). Escape or a click outside closes */
/* the box. */
export function DrawingSelection({ session, strokes, layerRef, edge, snap, wrap, onWrapChange, layer, allowed }: DrawingSelectionProps) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [, setTick] = useState(0);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const latest = useRef(selection);
  latest.current = selection;

  /* The layer's place and zoom, to change between screen and drawing coordinates. */
  function frame() {
    return layerRef.current ? zoomed(layerRef.current) : null;
  }

  function position(event: { clientX: number; clientY: number }) {
    const current = frame();
    return current ? { x: (event.clientX - current.rect.left) / current.scale, y: (event.clientY - current.rect.top) / current.scale } : null;
  }

  /* The strokes the selection takes: the picked ones, or those the box takes. */
  function chosenStrokes(current: Selection) {
    return current.picked ?? selectedStrokes(strokes, current.box, edge, allowed);
  }

  /* Select an anchored drawing, with the box exactly around it. */
  function selectAnchored(block: HTMLElement) {
    const box = anchoredBox(session, block);
    setSelection(box ? { box, anchored: block, picked: null } : null);
  }

  function anchor() {
    const current = latest.current;
    if (!current || current.anchored) return;
    const block = anchorDrawing(session, current.box, { edge, snap, wrap, allowed, picked: current.picked, blockers: [surfaceRef.current] });
    if (block) selectAnchored(block);
  }

  function detach() {
    const current = latest.current;
    if (!current?.anchored) return;
    const box = detachDrawing(session, current.anchored, layer);
    setSelection(box ? { box, anchored: null, picked: null } : null);
  }

  /* The wrap choice is remembered for new drawings, and changes a selected anchored drawing too, */
  /* keeping it where it is. */
  function chooseWrap(next: DrawingWrap) {
    onWrapChange(next);
    const block = latest.current?.anchored;
    const box = block && anchoredBox(session, block);
    if (block && box && drawingWrap(block) !== next && moveDrawing(session, block, box, { wrap: next, snap }, [surfaceRef.current])) selectAnchored(block);
  }

  function remove() {
    const current = latest.current;
    if (!current) return;
    if (current.anchored) {
      session.checkpoint();
      current.anchored.remove();
      session.commit();
    } else if (current.picked) {
      const picked = new Set(current.picked);
      session.saveDrawing(strokes.filter((_, index) => !picked.has(index)));
    } else {
      const { taken, left } = takeStrokes(strokes, current.box, edge, allowed);
      if (taken.length) session.saveDrawing(left);
    }
    setSelection(null);
  }

  /* Move what is selected by a little: an anchored drawing is anchored again a little further */
  /* along; loose strokes are moved themselves, with their box. */
  function nudge(dx: number, dy: number) {
    const current = latest.current;
    if (!current) return;
    if (current.anchored) {
      const box = shifted(current.box, dx, dy);
      const top = textTop(session);
      if (top !== null && box.y < top) return;
      if (moveDrawing(session, current.anchored, box, { wrap: drawingWrap(current.anchored), snap }, [surfaceRef.current])) selectAnchored(current.anchored);
      return;
    }
    const chosen = new Set(chosenStrokes(current));
    if (!chosen.size) return;
    session.saveDrawing(strokes.map((stroke, index) => (chosen.has(index) ? moveStrokes([stroke], dx, dy)[0] : stroke)));
    setSelection({ ...current, box: shifted(current.box, dx, dy) });
  }

  /* Enter anchors, Escape closes, Delete removes and the arrow keys move. Listening early */
  /* (capture) keeps Escape from also leaving drawing mode, and the arrows from scrolling. */
  const actions = useRef({ anchor, remove, nudge });
  actions.current = { anchor, remove, nudge };
  useEffect(() => {
    if (!selection) return;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.target as Element).closest?.('input, textarea')) return;
      const arrow = arrows[event.key];
      const step = event.shiftKey ? 10 : 1;
      const action = arrow ? () => actions.current.nudge(arrow[0] * step, arrow[1] * step)
        : event.key === 'Escape' ? () => setSelection(null)
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

  /* The loose strokes the selection takes glow. */
  useLayoutEffect(() => {
    const shown = layerRef.current;
    if (!shown) return;
    strokeElements(shown, '[data-selected]').forEach(path => path.removeAttribute('data-selected'));
    if (!selection || selection.anchored) return;
    chosenStrokes(selection).forEach(index => strokeElements(shown, `[data-stroke="${index}"]`)[0]?.setAttribute('data-selected', ''));
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

  /* An anchored drawing in this note's text under the pointer, if any. A drawing in front of the */
  /* text takes no room, so the box its strokes fill is what counts. */
  function anchoredAt(x: number, y: number) {
    const body = session.body();
    const blocks = Array.from(body?.querySelectorAll<HTMLElement>('.drawing-block') ?? []).reverse();
    return blocks.find(block => {
      const rect = drawingInk(block).getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }) ?? null;
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

    /* Picked strokes keep their exact box; they are moved with the arrow keys. */
    if (current?.picked && target.closest('.drawing-selection-box')) return;
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
      setSelection({ box, anchored: block, picked: null });
      drag.current = { kind: 'move', startX: at.x, startY: at.y, startBox: box };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    const box = { x: at.x, y: at.y, width: 0, height: 0 };
    drag.current = { kind: 'new', startX: at.x, startY: at.y, startBox: box };
    setSelection({ box, anchored: null, picked: null });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  /* Double-clicking a loose stroke picks it and every stroke touching it (on the layer being */
  /* worked on), with the box fitted exactly around them. */
  function handleDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    const at = position(event);
    if (!at || (event.target as Element).closest('.drawing-selection-bar')) return;
    if (anchoredAt(event.clientX, event.clientY)) return;
    const index = strokes.map((stroke, place) => ({ stroke, place })).reverse()
      .find(({ stroke }) => allowed(stroke) && touchesStroke(stroke, at.x, at.y, PICK_REACH))?.place;
    if (index === undefined) return;
    const picked = connectedStrokes(strokes, index, allowed);
    const box = strokesBounds(picked.map(place => strokes[place]));
    if (box) setSelection({ box, anchored: null, picked });
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
      : current.kind === 'move' ? shifted(startBox, dx, dy)
        : resizeBox(startBox, current.kind, dx, dy, Boolean(anchored));

    /* An anchored drawing stops at the top of the text: moving keeps it just below the details, */
    /* and a resize that would reach above it is not made. */
    const top = anchored ? textTop(session) : null;
    if (top !== null && box.y < top) {
      if (current.kind !== 'move') return;
      box = { ...box, y: top };
    }
    if (anchored) preview(anchored, startBox, box);
    setSelection(selected => (selected ? { ...selected, box } : selected));
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
      if (changed && moveDrawing(session, block, box, { wrap: drawingWrap(block), snap }, [surfaceRef.current])) selectAnchored(block);
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
  const hasStrokes = selection ? Boolean(selection.anchored) || chosenStrokes(selection).length > 0 : false;
  const dragging = drag.current !== null;
  const handles = selection?.picked ? [] : selection?.anchored ? CORNERS : HANDLES;
  const shownWrap = selection?.anchored ? drawingWrap(selection.anchored) : wrap;

  return (
    <div
      ref={surfaceRef}
      className="drawing-surface is-select"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
    >
      {shown && selection && (
        <div className={`drawing-selection-box ${selection.anchored ? 'is-anchored' : ''} ${selection.picked ? 'is-picked' : ''}`} style={shown}>
          {handles.map(handle => <span key={handle} className={`drawing-selection-handle is-${handle}`} data-handle={handle} />)}
          {!dragging && (selection.box.width >= MIN_BOX || selection.box.height >= MIN_BOX) && (
            <div className={`drawing-selection-bar ${barAtEnd ? 'is-end' : ''}`} role="toolbar" aria-label="Selection">
              <span className="drawing-wrap-choice" role="radiogroup" aria-label="With the text">
                {DRAWING_WRAPS.map((option, index) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    className={`page-bar-button ${shownWrap === option.value ? 'selected' : ''}`}
                    aria-checked={shownWrap === option.value}
                    aria-label={option.label}
                    data-tooltip={option.label}
                    data-tooltip-wrap=""
                    data-tooltip-align={barAtEnd || index ? 'end' : 'start'}
                    onClick={() => chooseWrap(option.value)}
                  >
                    <Icon name={option.icon} size={16} />
                  </button>
                ))}
              </span>
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
