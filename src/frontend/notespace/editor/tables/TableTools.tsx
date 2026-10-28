import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { edgeScrollStep, visibleArea, zoomed } from '../../../lib/geometry';
import { Icon, type IconName } from '../../../components/Icon';
import { emptyParagraph, placeCaret } from '../text/dom';
import { useSessionValue, type EditorSession } from '../session';
import {
  borderNear, cellRange, cellsInRange, columnResizeChange, ensureColumns, hasMergedCells, insertColumn, insertRow, isFitToWidth, measureColumns, mergeCells, moveColumn, moveRow, removeColumn,
  removeRow, repeatsHeader, resizeColumn, rowHeightLimit, rowMinHeight, setFitToWidth, setHeaders, setRepeatHeader, setRowHeight, tableGrid, tableHeaders, unmergeCell, MIN_COLUMN_WIDTH, type BorderHit, type CellRange
} from './tables';
import { cellAt, tableSlice, tableText } from './tableClipboard';
import { writeClipboard } from '../text/clipboard';
import { cleanHtml } from '../../sanitize';

type TableToolsProps = {
  session: EditorSession;
  locked: boolean;
};

type Part = 'table' | 'row' | 'column';

/* The table, row or column chosen with a grip. index is the row or column number (0 for a whole table). */
type Pick = { table: HTMLTableElement; part: Part; index: number };

/* The cell under the pointer, which decides which row and column grips are shown. */
type Hover = { table: HTMLTableElement; row: number; column: number };

/* A row or column being dragged from position "from" to position "to". */
type Drag = { part: 'row' | 'column'; table: HTMLTableElement; from: number; to: number };
type Press = { part: 'row' | 'column'; table: HTMLTableElement; index: number; x: number; y: number };

/* Several cells chosen by selecting text across them, which can be merged into one. */
type CellChoice = { table: HTMLTableElement; range: CellRange };

/* A cell's border near the pointer, which can be dragged to resize its column or row. */
type Edge = BorderHit & { table: HTMLTableElement };

/* A border being dragged. Only the line moves; the size is set once on release, so a row that */
/* grows past its page's end does not move to the next page (taking its border away from the */
/* pointer) mid-drag. Kept here: where the drag started (the pointer and the note's scroll), the */
/* sizes before it and a row's smallest height, where the pointer is now and whether it has moved */
/* yet, and the note's zoom (distances are divided by it, as sizes are stored at 100%). */
type Sizing = Edge & {
  start: number;
  scroll: number;
  widths: number[];
  height: number;
  least: number;
  most: number;
  pointer: number;
  moved: boolean;
  scale: number;
};

/* How close (in pixels) the pointer must be to a border to grab it. */
const EDGE_REACH = 4;
type Box = { top: number; left: number; width: number; height: number };
type Stretch = { top: number; bottom: number };

type MenuItem = {
  label: string;
  icon?: IconName;

  /* Items with checked set are on/off switches. */
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  run: () => void;
};

/* How far a grip must be dragged before it counts as a drag rather than a click. */
const DRAG_DISTANCE = 4;


/* =========================
   Measuring Tables
   ========================= */

function boxOf(element: Element): Box {
  const { top, left, width, height } = element.getBoundingClientRect();
  return { top, left, width, height };
}

/* A tool placed at a point on screen (a grip, a cell's button) is hidden while that point is */
/* outside the note's visible area, such as above the page bar when the table is scrolled up, so */
/* it never sits over the bars. */
function inView(style: CSSProperties, of: Element): CSSProperties {
  const area = visibleArea(of);
  const top = Number(style.top);
  return top < area.top || top > area.bottom - 8 ? { ...style, display: 'none' } : style;
}

/* Where a table sits on each page: one stretch, or, for a table split over pages (see */
/* pagination.ts), one per page around the rows there, with the copy of the header row shown */
/* above them on each later page. The rows moved onto later pages run past the table's own box, */
/* into the space it reserves below it. */
function pageStretches(table: HTMLTableElement): Stretch[] {
  const { top, bottom } = table.getBoundingClientRect();
  if (!table.classList.contains('page-table-expanded')) return [{ top, bottom }];
  const header = table.rows[0];
  const copied = repeatsHeader(table) && header && Array.from(header.cells).every(cell => cell.tagName === 'TH') ? header.getBoundingClientRect().height : 0;
  const stretches: Stretch[] = [];
  Array.from(table.rows).forEach(row => {
    const box = row.getBoundingClientRect();
    const last = stretches[stretches.length - 1];
    if (last && box.top - last.bottom < 2) last.bottom = Math.max(last.bottom, box.bottom);
    else stretches.push({ top: last ? box.top - copied : box.top, bottom: box.bottom });
  });
  return stretches.length ? stretches : [{ top, bottom }];
}

/* A table's screen area, taking in the rows moved onto later pages. */
function tableArea(table: HTMLTableElement) {
  const { top, bottom, left, right } = table.getBoundingClientRect();
  return { top, left, right, bottom: Math.max(bottom, ...pageStretches(table).map(stretch => stretch.bottom)) };
}

/* An outline from one height to another, cut to the part of the note that can be seen, so a long */
/* table's outline never covers the page bar or tabs. A cut edge has no border, so the outline */
/* reads as carrying on past it. Nothing when none of it is in view. */
function outlineStyle(from: number, to: number, left: number, width: number, area: Stretch): CSSProperties[] {
  const top = Math.max(from, area.top);
  const bottom = Math.min(to, area.bottom);
  if (bottom <= top) return [];
  return [{
    top,
    left,
    width,
    height: bottom - top,
    ...(top > from ? { borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 } : {}),
    ...(bottom < to ? { borderBottomWidth: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : {})
  }];
}

/* The outlines drawn over a table part, one per page the part is on, never across the gap */
/* between pages. */
function outlineStyles(box: Box, table: HTMLTableElement): CSSProperties[] {

  /* A whole table or a column covers every page's rows, which run past the table's own box; a */
  /* row is cut to its box. */
  const tableBox = table.getBoundingClientRect();
  const tall = box.top <= tableBox.top + 1 && box.top + box.height >= tableBox.bottom - 1;
  const area = visibleArea(table);
  return pageStretches(table).flatMap(piece => outlineStyle(
    tall ? piece.top : Math.max(piece.top, box.top),
    tall ? piece.bottom : Math.min(piece.bottom, box.top + box.height),
    box.left, box.width, area
  ));
}

/* The outlines drawn over chosen cells, one per page around the ones there, never across the gap */
/* between pages. */
function rangeOutlines(table: HTMLTableElement, range: CellRange): CSSProperties[] {
  const boxes = cellsInRange(table, range).map(cell => cell.getBoundingClientRect());
  const area = visibleArea(table);
  return pageStretches(table).flatMap(piece => {
    const here = boxes.filter(box => box.bottom > piece.top && box.top < piece.bottom);
    if (!here.length) return [];
    const left = Math.min(...here.map(box => box.left));
    const width = Math.max(...here.map(box => box.right)) - left;
    return outlineStyle(Math.min(...here.map(box => box.top)), Math.max(...here.map(box => box.bottom)), left, width, area);
  });
}

/* The resize line on a border. While hovering it covers only the border of the cell under the */
/* pointer. While dragging it is moved by delta (on screen) to where the border will go, and runs */
/* the whole border: a column's down the table's rows on the page being pointed at, a row's across */
/* the table. While dragging it is hidden rather than removed when out of view, as it holds the */
/* pointer until release. */
function guideStyle(edge: Edge, sizing: Sizing | null, delta: number, pointerY: number): CSSProperties | null {
  if (!edge.cell.isConnected) return null;
  const cell = edge.cell.getBoundingClientRect();
  const area = visibleArea(edge.table);
  const table = edge.table.getBoundingClientRect();
  let style: CSSProperties | null = null;
  if (edge.kind === 'column') {
    const stretches = sizing ? pageStretches(edge.table) : [];
    const piece = stretches.find(item => pointerY >= item.top && pointerY <= item.bottom)
      ?? stretches.find(item => item.bottom > area.top && item.top < area.bottom);
    const top = Math.max(piece?.top ?? cell.top, area.top);
    const bottom = Math.min(piece?.bottom ?? cell.bottom, area.bottom);
    if (bottom > top) style = { left: cell.right + delta - EDGE_REACH, top, width: EDGE_REACH * 2, height: bottom - top };
  } else {
    const y = cell.bottom + delta;
    if (y >= area.top && y <= area.bottom) {
      const left = sizing ? table.left : cell.left;
      const right = sizing ? table.right : cell.right;
      style = { top: y - EDGE_REACH, left, width: right - left, height: EDGE_REACH * 2 };
    }
  }
  if (style || !sizing) return style;
  return { left: cell.right + (edge.kind === 'column' ? delta : 0),
    top: cell.bottom + (edge.kind === 'row' ? delta : 0), width: 0, height: 0, visibility: 'hidden' };
}

/* The screen area of a whole table, one row, or one column. */
function partBox(table: HTMLTableElement, part: Part, index: number): Box | null {
  const whole = boxOf(table);
  if (part === 'table') return whole;
  if (part === 'row') {
    const row = table.rows[index];
    return row ? { ...whole, top: boxOf(row).top, height: boxOf(row).height } : null;
  }

  /* A column is measured from a cell that covers only that column, since merged cells are wider. */
  const column = tableGrid(table).grid.map(line => line[index]).filter(Boolean);
  const cell = column.find(item => item.colSpan <= 1) ?? column[0];
  return cell ? { ...whole, left: boxOf(cell).left, width: boxOf(cell).width } : null;
}

/* The cell border near the pointer. Only right and bottom borders count, so the table's left and */
/* top edges are left to the row and column grips. */
function findEdge(table: HTMLTableElement, x: number, y: number): Edge | null {
  const hit = borderNear(table, x, y, EDGE_REACH);
  return hit && { ...hit, table };
}

/* The cells of a table, row or column chosen with a grip, grown to include merged cells. */
function pickedCells(pick: Pick) {
  const { grid, width } = tableGrid(pick.table);
  const top = pick.part === 'row' ? pick.index : 0;
  const bottom = pick.part === 'row' ? pick.index : grid.length - 1;
  const left = pick.part === 'column' ? pick.index : 0;
  const right = pick.part === 'column' ? pick.index : width - 1;
  const from = grid[top]?.[left];
  const to = grid[bottom]?.[right];
  return from && to ? cellRange(pick.table, from, to) : null;
}

/* The row or column under the pointer while dragging; past either end, the first or last one. */
function dropIndex(table: HTMLTableElement, part: 'row' | 'column', x: number, y: number) {
  const items = part === 'row' ? Array.from(table.rows) : Array.from(table.rows[0]?.cells ?? []);
  const index = items.findIndex(item => (part === 'row' ? y < item.getBoundingClientRect().bottom : x < item.getBoundingClientRect().right));
  return index < 0 ? items.length - 1 : index;
}


/* =========================
   Table Tools
   ========================= */

/* Grips for tables, rows and columns. Clicking a grip selects that part and opens its menu; */
/* dragging a row or column grip moves it within the table. Del deletes what is selected. */
/* In structured mode the block's own grip selects the table; in continuous mode a grip appears beside it. */
export function TableTools({ session, locked }: TableToolsProps) {
  const [hover, setHover] = useState<Hover | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState('');

  /* Cells selected for merging, or the merged cell holding the caret (which can be unmerged). */
  const [choice, setChoice] = useState<CellChoice | null>(null);
  const [mergedCell, setMergedCell] = useState<HTMLTableCellElement | null>(null);

  /* The border under the pointer, and the border being dragged. */
  const [edge, setEdge] = useState<Edge | null>(null);
  const [sizing, setSizing] = useState<Sizing | null>(null);

  /* Typing, scrolling and resizing can move a table, so each of them redraws the grips. */
  useSessionValue(session, snapshot => snapshot.layout);
  const [, setTick] = useState(0);
  const redraw = () => setTick(tick => tick + 1);

  const press = useRef<Press | null>(null);
  const anchorBack = useRef(0);

  /* The border drag as of now (the state lags a render behind), the pointer's last spot, the */
  /* note's scroll at the drag start, and the edge scrolling loop: its frame, the last frame's */
  /* time, and the part of a pixel still to scroll. */
  const sizingNow = useRef<Sizing | null>(null);
  const pointerAt = useRef({ x: 0, y: 0 });
  const edgeFrame = useRef(0);
  const lastFrame = useRef(0);
  const edgeCarry = useRef(0);
  const latest = useRef({ pick, locked, sizing, hoverTable: hover?.table ?? null });
  latest.current = { pick, locked, sizing, hoverTable: hover?.table ?? null };
  const actions = useRef({ choose, clear, removePart, endSizing });
  actions.current = { choose, clear, removePart, endSizing };

  /* The tools are fixed to the window, so over them the browser would scroll the window, not the */
  /* note (the pointer on a column's border stopped scrolling); the wheel scrolls the note instead. */
  useEffect(() => {
    function handleWheel(event: WheelEvent) {
      const scroller = session.scroller();
      if (!scroller || !(event.target as Element | null)?.closest?.('.table-tools')) return;
      event.preventDefault();
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? scroller.clientHeight : 1;
      scroller.scrollBy({ top: event.deltaY * unit, left: event.deltaX * unit });
    }
    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, [session]);

  useEffect(() => {
    const body = () => session.body();

    /* Show the grips for the cell under the pointer, and keep them while the pointer moves out */
    /* of the table towards a grip. */
    function handleMouseMove(event: MouseEvent) {
      if (latest.current.locked || press.current || latest.current.sizing) return;
      const target = event.target as Element;

      /* Over the resize line the border is still looked for, so the line follows the pointer */
      /* along a border into the next cell. */
      if (target.closest?.('.table-tools:not(.table-resize)')) return;
      const cell = target.closest?.<HTMLTableCellElement>('td, th');
      const table = cell?.closest('table');

      /* A border close to the pointer shows a resize handle. */
      const near = table ?? latest.current.hoverTable;
      const found = near?.isConnected && body()?.contains(near) ? findEdge(near, event.clientX, event.clientY) : null;
      setEdge(current => (current?.table === found?.table && current?.kind === found?.kind && current?.index === found?.index
        && current?.cell === found?.cell && current?.at === found?.at ? current : found));

      if (cell && table && body()?.contains(table)) {
        const place = tableGrid(table).places.get(cell);
        const next = { table, row: place?.row ?? 0, column: place?.column ?? 0 };
        setHover(current => (current?.table === next.table && current.row === next.row && current.column === next.column ? current : next));
        return;
      }
      setHover(current => {
        if (!current?.table.isConnected) return null;
        const bounds = tableArea(current.table);
        const near = event.clientX > bounds.left - 40 && event.clientX < bounds.right + 8 && event.clientY > bounds.top - 24 && event.clientY < bounds.bottom + 8;
        return near ? current : null;
      });
    }

    /* In structured mode, clicking the grip of a block that holds a table selects the table. */
    function handleClick(event: MouseEvent) {
      const handle = (event.target as Element).closest?.('.block-handle');
      const table = handle?.closest('.editable-block')?.querySelector<HTMLTableElement>('.block-content > table');
      if (table && !latest.current.locked) actions.current.choose({ table, part: 'table', index: 0 });
    }

    /* Clicking anywhere else ends the selection. */
    function handleMouseDown(event: MouseEvent) {
      if (latest.current.pick && !(event.target as Element).closest?.('.table-tools, .block-handle')) actions.current.clear();
    }

    /* Del or Backspace deletes the selected table, row or column; Escape ends the selection. */
    /* Keys typed in the comment box are left alone. */
    function handleKeyDown(event: KeyboardEvent) {
      const current = latest.current.pick;
      if (!current || (event.target as Element).closest?.('.table-menu-comment')) return;
      if (event.key !== 'Escape' && event.key !== 'Delete' && event.key !== 'Backspace') return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') actions.current.clear();
      else actions.current.removePart(current);
    }

    /* Selecting text across two or more cells of one table offers to merge them; a caret inside a */
    /* merged cell offers to unmerge it. */
    function handleSelectionChange() {
      const selection = window.getSelection();
      const from = cellAt(selection?.anchorNode);
      const to = cellAt(selection?.focusNode);
      const table = from?.closest('table');
      const usable = !latest.current.locked && table && body()?.contains(table);
      if (usable && selection && !selection.isCollapsed && to && from !== to && to.closest('table') === table) {
        const range = from ? cellRange(table, from, to) : null;
        setChoice(range ? { table, range } : null);
        setMergedCell(null);
        return;
      }
      setChoice(null);
      setMergedCell(usable && selection?.isCollapsed && from && (from.rowSpan > 1 || from.colSpan > 1) ? from : null);
    }

    /* Copying while a table, row or column is chosen with its grip copies those cells, with their */
    /* look, so they can be pasted into another table or as a new table. */
    function handleCopy(event: ClipboardEvent) {
      const current = latest.current.pick;
      const cells = current ? pickedCells(current) : null;
      if (!current || !cells || !event.clipboardData) return;
      event.preventDefault();
      const slice = tableSlice(current.table, cells);
      writeClipboard(event.clipboardData, cleanHtml(slice.outerHTML), tableText(slice));
    }

    const scroller = session.scroller();
    document.addEventListener('copy', handleCopy);
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('click', handleClick);
    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', redraw);
    scroller?.addEventListener('scroll', redraw);
    return () => {
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', redraw);
      scroller?.removeEventListener('scroll', redraw);
    };
  }, []);

  /* While a border is dragged, the browser's scroll anchoring is off (see holdScroll) and the */
  /* note scrolls at its edges (see scrollAtEdge); both stop if the editor goes mid-drag. */
  useEffect(() => () => {
    cancelAnimationFrame(anchorBack.current);
    cancelAnimationFrame(edgeFrame.current);
    sizingNow.current = null;
    session.scroller()?.classList.remove('is-sizing-table');
  }, [session]);

  /* Escape cancels a border drag. */
  const dragging = Boolean(sizing);
  useEffect(() => {
    if (!dragging) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      actions.current.endSizing(true);
    }
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [dragging]);

  /* Setting the size on release lays the pages out again, which can move rows to other pages, and */
  /* the browser's scroll anchoring would then scroll the note to keep some line in place. It is */
  /* turned off for the drag and the layout after it. */
  function holdScroll(hold: boolean) {
    const scroller = session.scroller();
    cancelAnimationFrame(anchorBack.current);
    if (hold) scroller?.classList.add('is-sizing-table');
    else anchorBack.current = requestAnimationFrame(() => {
      anchorBack.current = requestAnimationFrame(() => scroller?.classList.remove('is-sizing-table'));
    });
  }

  /* Selecting a part clears the text selection, so typing cannot change the table by accident. */
  function choose(next: Pick) {
    window.getSelection()?.removeAllRanges();
    setPick(next);
    setCommenting(false);
    setComment('');
  }

  function clear() {
    setPick(null);
    setCommenting(false);
  }

  /* Run a change to the table as one undo step and save it. */
  function change(run: () => void) {
    session.checkpoint();
    run();
    session.commit();
    redraw();
  }

  /* Delete a table, row or column. A table left without rows or columns is replaced by an empty line. */
  function removePart({ table, part, index }: Pick) {
    session.checkpoint();
    const remaining = part === 'row' ? removeRow(table, table.rows[index]) : part === 'column' ? removeColumn(table, index) : false;
    clear();
    setHover(null);
    if (remaining) {
      session.commit();
      return;
    }
    const paragraph = emptyParagraph();
    table.replaceWith(paragraph);
    session.linesChanged(paragraph, false);
  }

  /* Dragging a border: the sizes it starts from are measured, but nothing changes until release. */
  function startSizing(event: ReactPointerEvent<HTMLDivElement>) {
    if (!edge) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    holdScroll(true);
    session.checkpoint();
    const column = edge.kind === 'column';
    const start = column ? event.clientX : event.clientY;
    const scroller = session.scroller();
    const scroll = (column ? scroller?.scrollLeft : scroller?.scrollTop) ?? 0;
    const widths = column ? measureColumns(edge.table).map(width => Math.round(Math.max(MIN_COLUMN_WIDTH, width))) : [];
    const { scale } = zoomed(edge.table);
    const row = edge.table.rows[edge.index];
    const height = column ? 0 : row.getBoundingClientRect().height / scale;
    const least = column ? 0 : rowMinHeight(row, scale);
    const most = column ? Infinity : Math.max(height, least, rowHeightLimit(row, scale));
    pointerAt.current = { x: event.clientX, y: event.clientY };
    updateSizing({ ...edge, start, scroll, widths, height, least, most, pointer: start, moved: false, scale });
    lastFrame.current = 0;
    edgeCarry.current = 0;
    cancelAnimationFrame(edgeFrame.current);
    edgeFrame.current = requestAnimationFrame(scrollAtEdge);
  }

  function moveSizing(event: ReactPointerEvent<HTMLDivElement>) {
    const current = sizingNow.current;
    if (!current) return;
    pointerAt.current = { x: event.clientX, y: event.clientY };
    const pointer = current.kind === 'column' ? event.clientX : event.clientY;
    updateSizing({ ...current, pointer, moved: current.moved || Math.abs(pointer - current.start) >= 3 });
  }

  function updateSizing(next: Sizing | null) {
    sizingNow.current = next;
    setSizing(next);
  }

  /* How much the row or column changes (at 100% zoom) for the pointer now and the note's scroll. */
  /* The note may have scrolled since the press (at an edge, or with the wheel), moving the border */
  /* as much, so that is added in and the line stays at the pointer. It stops at the smallest size */
  /* (a row's text or page), and a column stops at the content's right edge. */
  function limitedChange(current: Sizing, scroll: number) {
    const raw = (current.pointer - current.start + scroll - current.scroll) / current.scale;
    return current.kind === 'row' ? Math.min(Math.max(current.least - current.height, raw), current.most - current.height)
      : columnResizeChange(current.table, current.index, current.widths, raw);
  }

  /* While a border is dragged near an edge of the note (or past it, as the pointer stays captured), */
  /* the note scrolls that way: up or down for a row, sideways for a column when the page is wider */
  /* than the pane. It waits until the pointer has moved, so pressing a border near an edge does */
  /* not start it, and stops once the line cannot go further (a size limit). Scrolls are whole */
  /* pixels, with the rest kept for the next frame; the note's scroll listener redraws the line. */
  function scrollAtEdge(now: number) {
    const current = sizingNow.current;
    const scroller = session.scroller();
    if (!current || !scroller || !current.table.isConnected) return;
    const elapsed = lastFrame.current ? now - lastFrame.current : 16;
    lastFrame.current = now;
    const row = current.kind === 'row';
    const pointer = row ? pointerAt.current.y : pointerAt.current.x;
    if (current.moved) {
      const box = scroller.getBoundingClientRect();
      const area = row ? visibleArea(current.table) : { top: box.left, bottom: box.right };
      edgeCarry.current += edgeScrollStep(pointer, area.top, area.bottom, elapsed);
      let step = Math.trunc(edgeCarry.current);
      edgeCarry.current -= step;
      if (step) {
        const scroll = row ? scroller.scrollTop : scroller.scrollLeft;
        if (limitedChange(current, scroll + step) === limitedChange(current, scroll)) step = 0;
      }
      if (step && row) scroller.scrollTop += step;
      else if (step) scroller.scrollLeft += step;
    }
    edgeFrame.current = requestAnimationFrame(scrollAtEdge);
  }

  /* A drag ends on release: the size is set once, as one undo step, and the pages laid out at once */
  /* (no frame shows the old layout). A row that no longer fits on its page then moves to the next */
  /* one, and the note scrolls with it, so its border stays where the line was let go. Escape, a */
  /* cancelled pointer or lost capture change nothing, so saving adds no undo step. */
  function endSizing(cancel = false) {
    const current = sizingNow.current;
    if (!current) return;
    cancelAnimationFrame(edgeFrame.current);
    const scroller = session.scroller();
    const scroll = (current.kind === 'column' ? scroller?.scrollLeft : scroller?.scrollTop) ?? current.scroll;
    const delta = limitedChange(current, scroll);
    if (!cancel && current.moved && Math.abs(delta) >= 0.5) {
      if (current.kind === 'column') {
        ensureColumns(current.table);
        resizeColumn(current.table, current.index, current.widths, delta);
        session.layOutPages?.();
      } else {
        const released = current.cell.getBoundingClientRect().bottom + delta * current.scale;
        setRowHeight(current.table.rows[current.index], current.height + delta);
        session.layOutPages?.();
        const moved = current.cell.getBoundingClientRect().bottom - released;
        if (scroller && Math.abs(moved) > 2) scroller.scrollTop += moved;
      }
    }
    updateSizing(null);
    setEdge(null);
    session.commit();
    holdScroll(false);
  }

  /* Merge the selected cells; the caret goes to the end of the merged cell. */
  function merge() {
    if (!choice) return;
    session.checkpoint();
    const merged = mergeCells(choice.table, choice.range);
    if (!merged) return;
    placeCaret(merged, true);
    session.commit();
    setChoice(null);
  }

  function unmerge() {
    const table = mergedCell?.closest('table');
    if (!mergedCell || !table) return;
    session.checkpoint();
    unmergeCell(table, mergedCell);
    placeCaret(mergedCell, true);
    session.commit();
    setMergedCell(null);
  }

  /* Move a whole table above or below its neighbouring line (continuous mode). */
  function moveTable(table: HTMLTableElement, up: boolean) {
    const neighbour = up ? table.previousElementSibling : table.nextElementSibling;
    if (!neighbour) return;
    change(() => (up ? neighbour.before(table) : neighbour.after(table)));
  }

  function menuItems({ table, part, index }: Pick): MenuItem[] {
    const headers = tableHeaders(table);
    const rows = table.rows.length;
    const columns = tableGrid(table).width;
    const remove = () => removePart({ table, part, index });

    /* Rows and columns cannot be moved while the table has merged cells. */
    const merged = hasMergedCells(table);

    if (part === 'row') {
      return [
        { label: 'Insert above', icon: 'plus', run: () => { change(() => insertRow(table, index, 'above')); setPick({ table, part, index: index + 1 }); } },
        { label: 'Insert below', icon: 'plus', run: () => change(() => insertRow(table, index, 'below')) },
        { label: 'Move up', icon: 'arrow-up', disabled: merged || index === 0, run: () => { change(() => moveRow(table, index, index - 1)); setPick({ table, part, index: index - 1 }); } },
        { label: 'Move down', icon: 'arrow-down', disabled: merged || index === rows - 1, run: () => { change(() => moveRow(table, index, index + 1)); setPick({ table, part, index: index + 1 }); } },
        { label: 'Delete row', icon: 'trash', danger: true, run: remove }
      ];
    }
    if (part === 'column') {
      return [
        { label: 'Insert left', icon: 'plus', run: () => { change(() => insertColumn(table, index, 'left')); setPick({ table, part, index: index + 1 }); } },
        { label: 'Insert right', icon: 'plus', run: () => change(() => insertColumn(table, index, 'right')) },
        { label: 'Move left', icon: 'arrow-left', disabled: merged || index === 0, run: () => { change(() => moveColumn(table, index, index - 1)); setPick({ table, part, index: index - 1 }); } },
        { label: 'Move right', icon: 'arrow-right', disabled: merged || index === columns - 1, run: () => { change(() => moveColumn(table, index, index + 1)); setPick({ table, part, index: index + 1 }); } },
        { label: 'Delete column', icon: 'trash', danger: true, run: remove }
      ];
    }

    /* Moving a whole table from this menu is for continuous mode; structured blocks are dragged by their grip. */
    const structured = Boolean(table.closest('.block-content'));
    return [
      { label: 'Header row', checked: headers.row, run: () => change(() => setHeaders(table, { ...headers, row: !headers.row })) },
      { label: 'Header column', checked: headers.column, run: () => change(() => setHeaders(table, { ...headers, column: !headers.column })) },
      { label: 'Repeat header on each page', checked: headers.row && repeatsHeader(table), disabled: !headers.row, run: () => change(() => setRepeatHeader(table, !repeatsHeader(table))) },
      { label: 'Fit to width', checked: isFitToWidth(table), run: () => change(() => setFitToWidth(table, !isFitToWidth(table))) },
      { label: 'Comment', icon: 'message-square', run: () => setCommenting(true) },
      ...(structured ? [] : [
        { label: 'Move up', icon: 'arrow-up' as IconName, disabled: !table.previousElementSibling, run: () => moveTable(table, true) },
        { label: 'Move down', icon: 'arrow-down' as IconName, disabled: !table.nextElementSibling, run: () => moveTable(table, false) }
      ]),
      { label: 'Delete table', icon: 'trash', danger: true, run: remove }
    ];
  }

  /* A row or column grip is a click (select and open the menu) unless it is dragged. */
  function startPress(event: ReactPointerEvent<HTMLButtonElement>, part: 'row' | 'column', table: HTMLTableElement, index: number) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    press.current = { part, table, index, x: event.clientX, y: event.clientY };
  }

  /* A table with merged cells cannot have its rows or columns moved, so its grips only open the menu. */
  function movePress(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = press.current;
    if (!current || hasMergedCells(current.table)) return;
    if (!drag && Math.hypot(event.clientX - current.x, event.clientY - current.y) < DRAG_DISTANCE) return;
    const to = dropIndex(current.table, current.part, event.clientX, event.clientY);
    setDrag({ part: current.part, table: current.table, from: current.index, to });
  }

  function endPress() {
    const current = press.current;
    press.current = null;
    if (!current) return;
    if (!drag) {
      choose({ table: current.table, part: current.part, index: current.index });
      return;
    }
    const { table, part, from, to } = drag;
    setDrag(null);
    if (from !== to) change(() => (part === 'row' ? moveRow(table, from, to) : moveColumn(table, from, to)));
    setPick(null);
  }

  if (locked) return null;

  /* The Merge cells button sits under the last of the selected cells in view (on a table split */
  /* over pages, under the outline on the last page); the Unmerge button sits inside the merged */
  /* cell's top-right corner, so it never covers the row above. */
  const shownChoice = choice?.table.isConnected ? choice : null;
  const choiceOutlines = shownChoice ? rangeOutlines(shownChoice.table, shownChoice.range) : [];
  const choiceEnd = choiceOutlines[choiceOutlines.length - 1];
  const mergedBox = mergedCell?.isConnected ? boxOf(mergedCell) : null;
  const keepSelection = (event: ReactMouseEvent) => event.preventDefault();

  const handle = sizing ?? (edge?.table.isConnected ? edge : null);
  const scroll = session.scroller();
  const guideScroll = sizing ? ((sizing.kind === 'column' ? scroll?.scrollLeft : scroll?.scrollTop) ?? sizing.scroll) : 0;
  const guideDelta = sizing ? limitedChange(sizing, guideScroll) * sizing.scale : 0;
  const guide = handle ? guideStyle(handle, sizing, guideDelta, pointerAt.current.y) : null;
  const cellTools = (
    <>
      {handle && guide && (
        <div
          className={`table-tools table-resize is-${handle.kind} ${sizing ? 'is-active' : ''}`}
          style={guide}
          aria-hidden="true"
          onPointerDown={startSizing}
          onPointerMove={moveSizing}
          onPointerUp={event => {
            moveSizing(event);
            endSizing();
          }}
          onPointerCancel={() => endSizing(true)}
          onLostPointerCapture={() => endSizing(true)}
        />
      )}

      {shownChoice && (
        <>
          {choiceOutlines.map((style, index) => (
            <div key={index} className="table-tools table-range" style={style} />
          ))}
          {choiceEnd && (
            <button
              type="button"
              className="table-tools table-cell-action"
              style={inView({ top: Number(choiceEnd.top) + Number(choiceEnd.height) + 6, left: Number(choiceEnd.left) + Number(choiceEnd.width), transform: 'translateX(-100%)' }, shownChoice.table)}
              onMouseDown={keepSelection}
              onClick={merge}
            >
              <Icon name="table" size={13} /> Merge cells
            </button>
          )}
        </>
      )}
      {!shownChoice && mergedBox && (
        <button
          type="button"
          className="table-tools table-cell-action"
          style={inView({ top: mergedBox.top + 4, left: mergedBox.left + mergedBox.width - 4, transform: 'translateX(-100%)' }, mergedCell as Element)}
          onMouseDown={keepSelection}
          onClick={unmerge}
        >
          <Icon name="grid" size={13} /> Unmerge
        </button>
      )}
    </>
  );

  const shownHover = hover?.table.isConnected ? hover : null;
  const shownPick = pick?.table.isConnected ? pick : null;
  const table = drag?.table ?? shownPick?.table ?? shownHover?.table;
  if (!table) return cellTools;

  const whole = boxOf(table);
  const structured = Boolean(table.closest('.block-content'));
  const rowBox = shownHover && shownHover.table === table ? partBox(table, 'row', shownHover.row) : null;
  const columnBox = shownHover && shownHover.table === table ? partBox(table, 'column', shownHover.column) : null;
  const pickBox = shownPick ? partBox(shownPick.table, shownPick.part, shownPick.part === 'table' ? 0 : shownPick.index) : null;
  const dragBox = drag ? partBox(drag.table, drag.part, drag.from) : null;
  const dropBox = drag ? partBox(drag.table, drag.part, drag.to) : null;

  /* On a table split over pages, the column grip sits at the top of the page being pointed at. */
  const columnTop = rowBox ? pageStretches(table).find(stretch => rowBox.top < stretch.bottom)?.top ?? whole.top : whole.top;

  /* The menu opens beside the grip that was clicked, and above it near the bottom of the window. */
  let menuTop = 0;
  let menuLeft = 0;
  if (shownPick && pickBox) {
    if (shownPick.part === 'row') {
      menuTop = pickBox.top + pickBox.height / 2 + 14;
      menuLeft = whole.left + 8;
    } else if (shownPick.part === 'column') {
      menuTop = whole.top + 12;
      menuLeft = pickBox.left + pickBox.width / 2 - 10;
    } else {
      menuTop = whole.top + 30;
      menuLeft = whole.left - 30;
    }
  }
  const menuAbove = menuTop + 300 > window.innerHeight && menuTop > 300;
  const grip = (event: ReactPointerEvent<HTMLButtonElement>, part: 'row' | 'column', index: number) => startPress(event, part, table, index);

  return (
    <>
      {cellTools}

      {/* Continuous mode has no block grips, so the table gets one beside its top-left corner. */}
      {!structured && !drag && (
        <button
          type="button"
          className="table-tools table-grip"
          style={inView({ top: whole.top + 2, left: whole.left - 30 }, table)}
          aria-label="Select table"
          onMouseDown={event => event.preventDefault()}
          onClick={() => choose({ table, part: 'table', index: 0 })}
        >
          <Icon name="grip" size={14} />
        </button>
      )}

      {/* The grip that was pressed stays in place during a drag, because it receives the pointer until release. */}
      {rowBox && shownHover && (!drag || drag.part === 'row') && (
        <button
          type="button"
          className="table-tools table-line-grip is-row"
          style={inView({ top: rowBox.top + rowBox.height / 2 - 11, left: whole.left - 7 }, table)}
          aria-label="Row options (drag to move)"
          onPointerDown={event => grip(event, 'row', shownHover.row)}
          onPointerMove={movePress}
          onPointerUp={endPress}
        >
          <Icon name="grip" size={12} />
        </button>
      )}

      {columnBox && shownHover && (!drag || drag.part === 'column') && (
        <button
          type="button"
          className="table-tools table-line-grip is-column"
          style={inView({ top: columnTop - 7, left: columnBox.left + columnBox.width / 2 - 11 }, table)}
          aria-label="Column options (drag to move)"
          onPointerDown={event => grip(event, 'column', shownHover.column)}
          onPointerMove={movePress}
          onPointerUp={endPress}
        >
          <Icon name="grip" size={12} />
        </button>
      )}

      {/* While dragging, the row or column is outlined and a line shows where it will go. */}
      {dragBox && drag && outlineStyles(dragBox, drag.table).map((style, index) => (
        <div key={index} className="table-tools table-pick" style={style} />
      ))}
      {drag && dropBox && drag.to !== drag.from && (
        <div
          className={`table-tools table-drop is-${drag.part}`}
          style={drag.part === 'row'
            ? { top: (drag.to < drag.from ? dropBox.top : dropBox.top + dropBox.height) - 1, left: dropBox.left, width: dropBox.width }
            : { left: (drag.to < drag.from ? dropBox.left : dropBox.left + dropBox.width) - 1, top: dropBox.top, height: dropBox.height }}
        />
      )}

      {shownPick && pickBox && !drag && (
        <>
          {outlineStyles(pickBox, shownPick.table).map((style, index) => (
            <div key={index} className="table-tools table-pick" style={style} />
          ))}
          <div
            className="table-tools table-menu"
            role="menu"
            aria-label={`${shownPick.part[0].toUpperCase()}${shownPick.part.slice(1)} options`}
            style={inView({ top: menuAbove ? menuTop - 40 : menuTop, left: Math.max(8, menuLeft), transform: menuAbove ? 'translateY(-100%)' : undefined }, table)}
          >
            {/* On/off options are shown as switches at the top, with the actions below them. */}
            {!commenting && menuItems(shownPick).map((item, index, items) => (item.checked !== undefined ? (
              <button
                key={item.label}
                type="button"
                role="menuitemcheckbox"
                aria-checked={item.checked}
                className={`table-menu-item is-switch ${items[index + 1]?.checked === undefined ? 'is-last-switch' : ''}`}
                onClick={item.run}
              >
                {item.label}
                <span className={`table-switch ${item.checked ? 'is-on' : ''}`} aria-hidden="true"><span /></span>
              </button>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`table-menu-item ${item.danger ? 'is-danger' : ''}`}
                disabled={item.disabled}
                onClick={item.run}
              >
                <span className="table-menu-icon">{item.icon && <Icon name={item.icon} size={14} />}</span>
                {item.label}
              </button>
            )))}

            {commenting && (
              <div className="table-menu-comment">
                <textarea
                  className="selection-input"
                  autoFocus
                  rows={2}
                  placeholder="Comment on this table…"
                  aria-label="Comment"
                  value={comment}
                  onChange={event => setComment(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setCommenting(false);
                    }
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      if (comment.trim()) session.addComment(shownPick.table, comment);
                      clear();
                    }
                  }}
                />
                <div className="selection-comment-actions">
                  <button type="button" className="btn btn-quiet" onClick={() => setCommenting(false)}>Cancel</button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!comment.trim()}
                    onClick={() => {
                      session.addComment(shownPick.table, comment);
                      clear();
                    }}
                  >
                    Comment
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
