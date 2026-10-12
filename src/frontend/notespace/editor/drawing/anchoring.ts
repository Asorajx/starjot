import type { DrawingStroke } from '../../../../shared/types/note';
import { getNote, updateNote } from '../../store';
import { joinBoxes, mostlyInside, moveStrokes, splitStroke, strokesBounds, type Box } from './drawing';
import {
  MIN_IMAGE_WIDTH, createDrawingBlock, drawingBox, drawingInk, drawingStrokes, hydrateImages, setDrawingWrap, setImageAlign, setImageWidth, type DrawingWrap, type ImageAlign
} from '../images/images';
import type { EditorSession } from '../session';
import { zoomed } from '../../../lib/geometry';

/* What happens to strokes on the selection box's edge (see DrawingPreferences). */
export type SelectEdge = 'whole' | 'cut';

/* Lines an anchored drawing can be placed in. */
const LINES = 'p, li, h1, h2, h3, h4, h5, h6, td, th, pre, .toggle-summary, .block-content';


/* =========================
   Choosing Strokes
   ========================= */

/* Which strokes a selection may take: those on the layer being worked on. */
export type StrokeFilter = (stroke: DrawingStroke) => boolean;

/* The strokes a selection box takes: those mostly inside it, or (when cutting) any that reach */
/* into it. Returns their places in the list. */
export function selectedStrokes(strokes: DrawingStroke[], box: Box, edge: SelectEdge, allowed: StrokeFilter = () => true) {
  return strokes.flatMap((stroke, index) => {
    if (!allowed(stroke)) return [];
    const taken = edge === 'whole' ? mostlyInside(stroke, box) : splitStroke(stroke, box).inside.length > 0;
    return taken ? [index] : [];
  });
}

/* Split the drawing into the strokes the box takes and the strokes left behind. When cutting, */
/* the parts of a stroke outside the box stay behind as strokes of their own. The box grows to */
/* fit whole strokes that reach past it. */
export function takeStrokes(strokes: DrawingStroke[], box: Box, edge: SelectEdge, allowed: StrokeFilter = () => true) {
  const chosen = new Set(selectedStrokes(strokes, box, edge, allowed));
  const taken: DrawingStroke[] = [];
  const left: DrawingStroke[] = [];
  strokes.forEach((stroke, index) => {
    if (!chosen.has(index)) left.push(stroke);
    else if (edge === 'whole') taken.push(stroke);
    else {
      const parts = splitStroke(stroke, box);
      taken.push(...parts.inside);
      left.push(...parts.outside);
    }
  });
  const fitted = edge === 'whole' ? joinBoxes(box, strokesBounds(taken)) : box;
  return { taken, left, box: fitted };
}

/* Where an anchored drawing sits, from where its box is on the text column. With snapping on: */
/* near the left edge it goes left with the text beside it, near the right edge right, and in */
/* the middle (or when it is most of the column's width) on a line of its own. With snapping */
/* off it goes on the nearer side, so its exact place can be kept as a distance from that side. */
export function anchorAlign(box: Box, columnWidth: number, snap = true): ImageAlign {
  const middle = box.x + box.width / 2;
  if (!snap) return middle < columnWidth / 2 ? 'wrap-left' : 'right';
  if (box.width > columnWidth * 0.6) return 'center';
  if (middle < columnWidth / 3) return 'wrap-left';
  if (middle > (columnWidth * 2) / 3) return 'right';
  return 'center';
}


/* =========================
   Placing Drawings
   ========================= */

/* The drawing layer shown over this session's note. */
export function drawingLayerOf(session: EditorSession) {
  return session.body()?.closest('.editor-width')?.querySelector<HTMLElement>('.drawing-layer') ?? null;
}

/* Where an anchored drawing's strokes are on the drawing layer (as shown, including any drag in */
/* progress). A drawing in front of the text takes no room, so its strokes' own box is measured. */
export function anchoredBox(session: EditorSession, block: HTMLElement): Box | null {
  const layer = drawingLayerOf(session);
  if (!layer) return null;
  const { rect, scale } = zoomed(layer);
  const bounds = drawingInk(block).getBoundingClientRect();
  return { x: (bounds.left - rect.left) / scale, y: (bounds.top - rect.top) / scale, width: bounds.width / scale, height: bounds.height / scale };
}

/* The top of the note's text on the drawing layer. An anchored drawing belongs to the text, so it */
/* cannot be moved above it (into the title and details). */
export function textTop(session: EditorSession) {
  const body = session.body();
  const layer = drawingLayerOf(session);
  if (!body || !layer) return null;
  const { rect, scale } = zoomed(layer);
  return (body.getBoundingClientRect().top - rect.top) / scale;
}

/* The place in the text nearest to a point on screen, at the start of its line. Things that */
/* cannot hold a drawing (links, page cards, images, code) are stepped out of. */
function placeAt(body: HTMLElement, x: number, y: number, blockers: (HTMLElement | null)[]) {
  /* Things above the text (the drawing surface, toolbars) let the point through while looking. */
  const shown = blockers.filter((item): item is HTMLElement => Boolean(item));
  shown.forEach(item => item.style.setProperty('pointer-events', 'none', 'important'));
  const found = document.caretRangeFromPoint?.(x, y) ?? null;
  shown.forEach(item => item.style.removeProperty('pointer-events'));

  const lines = Array.from(body.querySelectorAll<HTMLElement>(LINES)).filter(line => !line.querySelector(LINES));
  let range = found && body.contains(found.startContainer) ? found : null;
  if (!range && lines.length) {
    /* Above the text: its first line. Below it (or anywhere else): its last line. */
    const first = lines[0];
    const before = y < first.getBoundingClientRect().top;
    const line = before ? first : lines[lines.length - 1];
    range = document.createRange();
    range.selectNodeContents(line);
    range.collapse(before);
  }
  if (!range) return null;
  range.collapse(true);

  const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  const outside = start?.closest('a, code, pre, [contenteditable="false"]');
  if (outside && body.contains(outside)) range.setStartBefore(outside.closest('pre') ?? outside);
  range.collapse(true);
  return range;
}

/* How a drawing is placed: in front of the text or wrapped by it, and (when wrapped) whether it */
/* snaps to its line and side. */
export type Placement = { wrap: DrawingWrap; snap: boolean };

/* Put a drawing block into the text, shown as wide as the box. Wrapped, it goes in at the line */
/* nearest the box's top: with snapping on it lines up with that line and its side of the column; */
/* with it off it keeps the box's exact place, as a distance down from its line and in from its */
/* side. In front of the text, it goes in at the line through the box's middle, and keeps the */
/* box's exact place measured from the start of that line. */
function insertDrawing(body: HTMLElement, layer: HTMLElement, block: HTMLElement, box: Box, { wrap, snap }: Placement, blockers: (HTMLElement | null)[]) {
  const { rect, scale } = zoomed(layer);
  const column = layer.offsetWidth;
  const front = wrap === 'front';
  const middle = rect.top + (box.y + box.height / 2) * scale;
  let range = placeAt(body, rect.left + 2, front ? middle : rect.top + box.y * scale + 2, blockers);
  if (!range) return false;

  /* In front of the text, a drawing in the gap between two lines (an underline) belongs to the */
  /* line above it. */
  const found = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest(LINES);
  if (front && found && middle < found.getBoundingClientRect().top) {
    const lines = Array.from(body.querySelectorAll<HTMLElement>(LINES)).filter(line => !line.querySelector(LINES));
    const above = lines[lines.indexOf(found as HTMLElement) - 1];
    if (above) {
      range = document.createRange();
      range.selectNodeContents(above);
      range.collapse(true);
    }
  }

  setDrawingWrap(block, wrap);
  delete block.dataset.offset;
  if (front) {
    setImageAlign(block, 'left');
    setImageWidth(block, Math.max(MIN_IMAGE_WIDTH, box.width));
  } else {
    const align = anchorAlign(box, column, snap);
    setImageAlign(block, align);
    setImageWidth(block, Math.max(MIN_IMAGE_WIDTH, Math.min(box.width, column)));
  }
  if (!snap && !front) {
    const align = anchorAlign(box, column, snap);
    const line = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest(LINES);
    const lineTop = range.getClientRects()[0]?.top ?? line?.getBoundingClientRect().top ?? rect.top;
    const side = align === 'right' ? column - (box.x + box.width) : box.x;
    const x = Math.round(Math.max(0, side));
    const y = Math.round(Math.max(0, (rect.top + box.y * scale - lineTop) / scale));
    block.dataset.offset = `${x} ${y}`;
  }

  /* Text sitting straight in the note, outside any line, gets a line of its own for the drawing. */
  const container = range.startContainer;
  if (container === body || (container.parentElement === body && container.nodeType === Node.TEXT_NODE)) {
    const line = document.createElement('p');
    line.appendChild(block);
    range.insertNode(line);
  } else {
    range.insertNode(block);
  }

  /* In front of the text, the block now marks the start of its line; the strokes are placed */
  /* from there, exactly where the box is. */
  if (front) {
    const start = block.getBoundingClientRect();
    const x = Math.round((rect.left + box.x * scale - start.left) / scale);
    const y = Math.round((rect.top + box.y * scale - start.top) / scale);
    block.dataset.offset = `${x} ${y}`;
  }
  hydrateImages(body);
  return true;
}


/* =========================
   Anchoring and Detaching
   ========================= */

type AnchorOptions = Placement & {
  edge: SelectEdge;
  allowed: StrokeFilter;

  /* Strokes picked one by one (double-clicked), taken exactly instead of by the box. */
  picked?: number[] | null;

  /* Things above the text, let through while finding the place in the text. */
  blockers: (HTMLElement | null)[];
};

/* Anchor the strokes in the box (or the picked strokes) into the text. Picked strokes fit their */
/* box exactly, with no space around them. One undo step. Returns the new drawing, or null when */
/* there are no strokes to anchor. */
export function anchorDrawing(session: EditorSession, selection: Box, { edge, snap, wrap, allowed, picked, blockers }: AnchorOptions) {
  const body = session.body();
  const layer = drawingLayerOf(session);
  const note = getNote(session.noteId);
  if (!body || !layer || !note) return null;
  const chosen = picked ? new Set(picked) : null;
  const { taken, left, box } = chosen
    ? {
      taken: note.drawing.filter((_, index) => chosen.has(index)),
      left: note.drawing.filter((_, index) => !chosen.has(index)),
      box: strokesBounds(note.drawing.filter((_, index) => chosen.has(index))) ?? selection
    }
    : takeStrokes(note.drawing, selection, edge, allowed);
  if (!taken.length) return null;

  const block = createDrawingBlock(moveStrokes(taken, -box.x, -box.y), box.width, box.height, box.width, 'left', null);
  session.checkpoint();
  updateNote(session.noteId, { drawing: left }, false);
  if (!insertDrawing(body, layer, block, box, { wrap, snap }, blockers)) {
    updateNote(session.noteId, { drawing: note.drawing }, false);
    return null;
  }
  session.commit();
  return block;
}

/* Move (and resize) an anchored drawing to a new box, or change how it sits with the text: it is */
/* anchored again from the new box. One undo step. Returns false when it could not be placed. */
export function moveDrawing(session: EditorSession, block: HTMLElement, box: Box, placement: Placement, blockers: (HTMLElement | null)[] = []) {
  const body = session.body();
  const layer = drawingLayerOf(session);
  if (!body || !layer || !body.contains(block)) return false;
  session.checkpoint();
  const place = document.createComment('');
  block.replaceWith(place);
  block.style.removeProperty('transform');
  if (!insertDrawing(body, layer, block, box, placement, blockers)) {
    place.replaceWith(block);
    return false;
  }
  place.remove();
  session.commit();
  return true;
}

/* Turn an anchored drawing back into loose strokes where it sits now (at the size it is shown), */
/* on the given layer (or the first layer above the text). One undo step. Returns the strokes' */
/* box on the drawing layer, or null. */
export function detachDrawing(session: EditorSession, block: HTMLElement, layer?: string) {
  const body = session.body();
  const note = getNote(session.noteId);
  const box = anchoredBox(session, block);
  if (!body || !note || !box || !body.contains(block)) return null;
  const strokes = moveStrokes(drawingStrokes(block), box.x, box.y, box.width / drawingBox(block).width).map(stroke => (layer ? { ...stroke, layer } : stroke));

  session.checkpoint();
  updateNote(session.noteId, { drawing: [...note.drawing, ...strokes] }, false);
  block.remove();
  session.commit();
  return box;
}
