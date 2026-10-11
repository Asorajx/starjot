import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon, type IconName } from '../../components/Icon';
import { emptyParagraph } from './dom';
import { useSessionValue, type EditorSession } from './session';
import {
  insertColumn, insertRow, isFitToWidth, moveColumn, moveRow, removeColumn, removeRow, setFitToWidth, setHeaders, tableHeaders
} from './tables';

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
type Box = { top: number; left: number; width: number; height: number };

type MenuItem = {
  label: string;
  icon?: IconName;

  /* Items with checked set are on/off switches, shown with a tick. */
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
  const cell = table.rows[0]?.cells[index];
  return cell ? { ...whole, left: boxOf(cell).left, width: boxOf(cell).width } : null;
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

  /* Typing, scrolling and resizing can move a table, so each of them redraws the grips. */
  useSessionValue(session, snapshot => snapshot.layout);
  const [, setTick] = useState(0);
  const redraw = () => setTick(tick => tick + 1);

  const press = useRef<Press | null>(null);
  const latest = useRef({ pick, locked });
  latest.current = { pick, locked };
  const actions = useRef({ choose, clear, removePart });
  actions.current = { choose, clear, removePart };

  useEffect(() => {
    const body = () => document.getElementById('note-body');

    /* Show the grips for the cell under the pointer, and keep them while the pointer moves out */
    /* of the table towards a grip. */
    function handleMouseMove(event: MouseEvent) {
      if (latest.current.locked || press.current) return;
      const target = event.target as Element;
      if (target.closest?.('.table-tools')) return;
      const cell = target.closest?.<HTMLTableCellElement>('td, th');
      const table = cell?.closest('table');
      if (cell && table && body()?.contains(table)) {
        const next = { table, row: (cell.parentElement as HTMLTableRowElement).rowIndex, column: cell.cellIndex };
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
      const current = latest.current.pick;
      if (!current || (event.target as Element).closest?.('.table-menu-comment')) return;
      if (event.key !== 'Escape' && event.key !== 'Delete' && event.key !== 'Backspace') return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') actions.current.clear();
      else actions.current.removePart(current);
    }

    const scroller = document.getElementById('main-scroll');
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('click', handleClick);
    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', redraw);
    scroller?.addEventListener('scroll', redraw);
    return () => {
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

  /* Move a whole table above or below its neighbouring line (continuous mode). */
  function moveTable(table: HTMLTableElement, up: boolean) {
    const neighbour = up ? table.previousElementSibling : table.nextElementSibling;
    if (!neighbour) return;
    change(() => (up ? neighbour.before(table) : neighbour.after(table)));
  }

  function menuItems({ table, part, index }: Pick): MenuItem[] {
    const headers = tableHeaders(table);
    const rows = table.rows.length;
    const columns = table.rows[0]?.cells.length ?? 0;
    const remove = () => removePart({ table, part, index });

    if (part === 'row') {
      return [
        { label: 'Insert above', icon: 'plus', run: () => { change(() => insertRow(table, index, 'above')); setPick({ table, part, index: index + 1 }); } },
        { label: 'Insert below', icon: 'plus', run: () => change(() => insertRow(table, index, 'below')) },
        { label: 'Move up', icon: 'arrow-up', disabled: index === 0, run: () => { change(() => moveRow(table, index, index - 1)); setPick({ table, part, index: index - 1 }); } },
        { label: 'Move down', icon: 'arrow-down', disabled: index === rows - 1, run: () => { change(() => moveRow(table, index, index + 1)); setPick({ table, part, index: index + 1 }); } },
        { label: 'Delete row', icon: 'trash', danger: true, run: remove }
      ];
    }
    if (part === 'column') {
      return [
        { label: 'Insert left', icon: 'plus', run: () => { change(() => insertColumn(table, index, 'left')); setPick({ table, part, index: index + 1 }); } },
        { label: 'Insert right', icon: 'plus', run: () => change(() => insertColumn(table, index, 'right')) },
        { label: 'Move left', icon: 'arrow-left', disabled: index === 0, run: () => { change(() => moveColumn(table, index, index - 1)); setPick({ table, part, index: index - 1 }); } },
        { label: 'Move right', icon: 'arrow-right', disabled: index === columns - 1, run: () => { change(() => moveColumn(table, index, index + 1)); setPick({ table, part, index: index + 1 }); } },
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

  function movePress(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = press.current;
    if (!current || (!drag && Math.hypot(event.clientX - current.x, event.clientY - current.y) < DRAG_DISTANCE)) return;
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
  const shownHover = hover?.table.isConnected ? hover : null;
  const shownPick = pick?.table.isConnected ? pick : null;
  const table = drag?.table ?? shownPick?.table ?? shownHover?.table;
  if (!table) return null;

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
            {!commenting && menuItems(shownPick).map(item => (
              <button
                key={item.label}
                type="button"
                role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={item.checked}
                className={`table-menu-item ${item.danger ? 'is-danger' : ''}`}
                disabled={item.disabled}
                onClick={item.run}
              >
                <span className="table-menu-icon">
                  {item.checked !== undefined ? (item.checked && <Icon name="check" size={14} />) : item.icon && <Icon name={item.icon} size={14} />}
                </span>
                {item.label}
              </button>
            ))}

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
