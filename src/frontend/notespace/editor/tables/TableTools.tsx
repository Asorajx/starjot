import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon, type IconName } from '../../../components/Icon';
import { emptyParagraph, placeCaret } from '../text/dom';
import { useSessionValue, type EditorSession } from '../session';
import {
  cellRange, cellsInRange, ensureColumns, hasMergedCells, insertColumn, insertRow, isFitToWidth, mergeCells, moveColumn, moveRow, removeColumn,
  removeRow, resizeColumn, setFitToWidth, setHeaders, setRowHeight, tableGrid, tableHeaders, unmergeCell, type CellRange
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

/* A column or row border near the pointer, which can be dragged to resize. at is its screen position. */
type Edge = { table: HTMLTableElement; kind: 'column' | 'row'; index: number; at: number };

/* A border being dragged: where the drag started, the sizes before it, and where the pointer is now. */
type Sizing = Edge & { start: number; pointer: number; widths: number[]; height: number };

/* How close (in pixels) the pointer must be to a border to grab it. */
const EDGE_REACH = 4;
type Box = { top: number; left: number; width: number; height: number };

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

/* Where a column's right border or a row's bottom border is on screen right now. */
function borderAt(table: HTMLTableElement, kind: 'column' | 'row', index: number) {
  if (kind === 'row') return table.rows[index]?.getBoundingClientRect().bottom ?? 0;
  for (const [cell, place] of tableGrid(table).places) {
    if (place.column + place.columns - 1 === index) return cell.getBoundingClientRect().right;
  }
  return 0;
}

/* The column or row border near the pointer. The table's left and top edges are left out, */
/* because the row and column grips sit there. */
function findEdge(table: HTMLTableElement, x: number, y: number): Edge | null {
  const whole = table.getBoundingClientRect();
  if (x < whole.left || x > whole.right + EDGE_REACH || y < whole.top || y > whole.bottom + EDGE_REACH) return null;

  const rights = new Map<number, number>();
  tableGrid(table).places.forEach((place, cell) => {
    const column = place.column + place.columns - 1;
    if (!rights.has(column)) rights.set(column, cell.getBoundingClientRect().right);
  });
  for (const [index, at] of rights) {
    if (Math.abs(x - at) <= EDGE_REACH) return { table, kind: 'column', index, at };
  }
  const rows = Array.from(table.rows);
  for (let index = 0; index < rows.length; index += 1) {
    const at = rows[index].getBoundingClientRect().bottom;
    if (Math.abs(y - at) <= EDGE_REACH) return { table, kind: 'row', index, at };
  }
  return null;
}

/* The screen area covered by a range of cells. */
function rangeBox(table: HTMLTableElement, range: CellRange): Box | null {
  const boxes = cellsInRange(table, range).map(cell => cell.getBoundingClientRect());
  if (!boxes.length) return null;
  const top = Math.min(...boxes.map(box => box.top));
  const left = Math.min(...boxes.map(box => box.left));
  return { top, left, width: Math.max(...boxes.map(box => box.right)) - left, height: Math.max(...boxes.map(box => box.bottom)) - top };
}

/* Select all the text of the cell holding the caret. False when the caret is not in a cell of */
/* root, or that cell's text is already all selected. */
function selectCellText(root: Element | null) {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const cell = cellAt(range?.startContainer);
  if (!selection || !range || !cell || !root?.contains(cell) || cellAt(range.endContainer) !== cell) return false;
  const whole = document.createRange();
  whole.selectNodeContents(cell);
  if (range.compareBoundaryPoints(Range.START_TO_START, whole) <= 0 && range.compareBoundaryPoints(Range.END_TO_END, whole) >= 0) return false;
  selection.removeAllRanges();
  selection.addRange(whole);
  return true;
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
  const latest = useRef({ pick, locked, sizing, hoverTable: hover?.table ?? null });
  latest.current = { pick, locked, sizing, hoverTable: hover?.table ?? null };
  const actions = useRef({ choose, clear, removePart });
  actions.current = { choose, clear, removePart };

  useEffect(() => {
    const body = () => session.body();

    /* Show the grips for the cell under the pointer, and keep them while the pointer moves out */
    /* of the table towards a grip. */
    function handleMouseMove(event: MouseEvent) {
      if (latest.current.locked || press.current || latest.current.sizing) return;
      const target = event.target as Element;
      if (target.closest?.('.table-tools')) return;
      const cell = target.closest?.<HTMLTableCellElement>('td, th');
      const table = cell?.closest('table');

      /* A border close to the pointer shows a resize handle. */
      const near = table ?? latest.current.hoverTable;
      const found = near?.isConnected && body()?.contains(near) ? findEdge(near, event.clientX, event.clientY) : null;
      setEdge(current => (current?.table === found?.table && current?.kind === found?.kind && current?.index === found?.index
        && current?.at === found?.at ? current : found));

      if (cell && table && body()?.contains(table)) {
        const place = tableGrid(table).places.get(cell);
        const next = { table, row: place?.row ?? 0, column: place?.column ?? 0 };
        setHover(current => (current?.table === next.table && current.row === next.row && current.column === next.column ? current : next));
        return;
      }
      setHover(current => {
        if (!current?.table.isConnected) return null;
        const bounds = current.table.getBoundingClientRect();
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
      /* Ctrl+A in a cell selects that cell's text; pressed again (with all of it selected), it */
      /* selects the whole note as usual. */
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'a' && selectCellText(body())) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
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

  /* Dragging a border: columns get stored widths (measured from the screen when the drag starts), */
  /* rows get a stored height. The whole drag is one undo step. */
  function startSizing(event: ReactPointerEvent<HTMLDivElement>) {
    if (!edge) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    session.checkpoint();
    const start = edge.kind === 'column' ? event.clientX : event.clientY;
    const widths = edge.kind === 'column' ? ensureColumns(edge.table) : [];
    const height = edge.kind === 'row' ? edge.table.rows[edge.index].getBoundingClientRect().height : 0;
    setSizing({ ...edge, start, pointer: start, widths, height });
  }

  function moveSizing(event: ReactPointerEvent<HTMLDivElement>) {
    if (!sizing) return;
    const pointer = sizing.kind === 'column' ? event.clientX : event.clientY;
    if (sizing.kind === 'column') resizeColumn(sizing.table, sizing.index, sizing.widths, pointer - sizing.start);
    else setRowHeight(sizing.table.rows[sizing.index], sizing.height + pointer - sizing.start);
    setSizing({ ...sizing, pointer });
  }

  function endSizing() {
    if (!sizing) return;
    setSizing(null);
    setEdge(null);
    session.commit();
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

  /* The Merge cells button sits under the selected cells; the Unmerge button sits inside the merged */
  /* cell's top-right corner, so it never covers the row above. */
  const choiceBox = choice?.table.isConnected ? rangeBox(choice.table, choice.range) : null;
  const mergedBox = mergedCell?.isConnected ? boxOf(mergedCell) : null;
  const keepSelection = (event: ReactMouseEvent) => event.preventDefault();

  const handle = sizing ?? (edge?.table.isConnected ? edge : null);
  const handleBox = handle ? boxOf(handle.table) : null;

  /* While dragging, the line sits on the real border rather than under the pointer, so it stops at */
  /* the smallest size (and at a row's text) even if the pointer keeps going. */
  const handleAt = sizing ? borderAt(sizing.table, sizing.kind, sizing.index) : handle?.at ?? 0;
  const cellTools = (
    <>
      {handle && handleBox && (
        <div
          className={`table-tools table-resize is-${handle.kind} ${sizing ? 'is-active' : ''}`}
          style={handle.kind === 'column'
            ? { left: handleAt - EDGE_REACH, top: handleBox.top, width: EDGE_REACH * 2, height: handleBox.height }
            : { top: handleAt - EDGE_REACH, left: handleBox.left, width: handleBox.width, height: EDGE_REACH * 2 }}
          aria-hidden="true"
          onPointerDown={startSizing}
          onPointerMove={moveSizing}
          onPointerUp={endSizing}
          onPointerCancel={endSizing}
        />
      )}

      {choiceBox && (
        <>
          <div className="table-tools table-range" style={choiceBox} />
          <button
            type="button"
            className="table-tools table-cell-action"
            style={{ top: choiceBox.top + choiceBox.height + 6, left: choiceBox.left + choiceBox.width, transform: 'translateX(-100%)' }}
            onMouseDown={keepSelection}
            onClick={merge}
          >
            <Icon name="table" size={13} /> Merge cells
          </button>
        </>
      )}
      {!choiceBox && mergedBox && (
        <button
          type="button"
          className="table-tools table-cell-action"
          style={{ top: mergedBox.top + 4, left: mergedBox.left + mergedBox.width - 4, transform: 'translateX(-100%)' }}
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
          style={{ top: whole.top + 2, left: whole.left - 30 }}
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
          style={{ top: rowBox.top + rowBox.height / 2 - 11, left: whole.left - 7 }}
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
          style={{ top: whole.top - 7, left: columnBox.left + columnBox.width / 2 - 11 }}
          aria-label="Column options (drag to move)"
          onPointerDown={event => grip(event, 'column', shownHover.column)}
          onPointerMove={movePress}
          onPointerUp={endPress}
        >
          <Icon name="grip" size={12} />
        </button>
      )}

      {/* While dragging, the row or column is outlined and a line shows where it will go. */}
      {dragBox && <div className="table-tools table-pick" style={dragBox} />}
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
          <div className="table-tools table-pick" style={pickBox} />
          <div
            className="table-tools table-menu"
            role="menu"
            aria-label={`${shownPick.part[0].toUpperCase()}${shownPick.part.slice(1)} options`}
            style={{ top: menuAbove ? menuTop - 40 : menuTop, left: Math.max(8, menuLeft), transform: menuAbove ? 'translateY(-100%)' : undefined }}
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
