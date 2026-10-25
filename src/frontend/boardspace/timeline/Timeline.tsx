import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from '../../components/Icon';
import { clampColumn, getPreferences, TIMELINE_COLUMNS, updatePreferences, usePreferences, type TimelineColumn } from '../../app/preferences';
import { showToast } from '../../lib/toasts';
import type { BoardProject, WorkItem } from '../../../shared/types/board';
import { dayRange, today } from '../dates';
import { canDrop, moveSprint, moveWork, setDates, toggleItemFolded, toggleSprintFolded, useBoard, type Drop } from '../board';
import { BACKLOG, childType, epicCompletion, shownSprintOf, sprintCompletion, timelineRows, WORK_TYPES, type ItemRow, type SprintRow } from '../workItems';
import type { EditorTarget } from '../WorkEditor';
import { AssigneePicker, Progress, StatusPicker, WorkTypeIcon } from '../workParts';
import { dayTicks, draggedDates, monthBands, timelineScale, widthOf, xOf, ZOOMS, type DragMode, type Scale, type Zoom } from './scale';

/* A card narrower than this hides the Status and Assignee columns, so the calendar has room. */
const NARROW_CARD = 880;

/* How far a bar must be dragged before it moves (a shorter press is a click, which opens it). */
const DRAG_SLOP = 4;

/* A bar being moved or stretched: which item, from where, and the dates it would get. */
type BarDrag = { pointerId: number; id: string; mode: DragMode; startX: number; start: string; end: string; moved: boolean; dates: { start: string; end: string }; x: number; y: number };

/* A row being dragged by its handle, and where it would land. */
type RowDrag = { kind: 'sprint' | 'item'; id: string };
type DropHint = { key: string; mode: 'before' | 'after' | 'inside' | 'section' };


/* =========================
   Rows
   ========================= */

type RowProps = {
  scale: Scale;
  board: BoardProject;
  dropHint: DropHint | null;
  onEdit: (target: EditorTarget) => void;
  onRowDragStart: (drag: RowDrag, event: DragEvent) => void;
};

/* The fold arrow of a sprint or item with something inside it (a gap keeps names lined up). */
function FoldButton({ folded, label, onToggle }: { folded: boolean; label: string; onToggle?: () => void }) {
  if (!onToggle) return <span className="timeline-fold is-empty" aria-hidden="true" />;
  return (
    <button type="button" className={`timeline-fold ${folded ? 'is-folded' : ''}`} aria-label={`${folded ? 'Show' : 'Hide'} what is in ${label}`} aria-expanded={!folded} onClick={onToggle}>
      <Icon name="chevron-down" size={14} />
    </button>
  );
}

function SprintRowView({ row, scale, board, dropHint, onEdit, onRowDragStart }: RowProps & { row: SprintRow }) {
  const { sprint } = row;
  const name = sprint?.name ?? 'Backlog';
  const folded = Boolean(board.collapsedSprints[row.id]);
  const completion = sprintCompletion(board, sprint ? sprint.id : '');
  const hint = dropHint?.key === `sprint:${row.id}` ? `is-drop-${dropHint.mode}` : '';
  return (
    <div className={`timeline-row is-sprint ${sprint ? '' : 'is-backlog'} ${hint}`} data-row-sprint={row.id}>
      <div className="timeline-meta">
        <div className="timeline-cell-work">
          {sprint
            ? <span className="timeline-handle" draggable aria-label={`Drag ${name} to reorder`} data-tooltip="Drag to reorder" onDragStart={event => onRowDragStart({ kind: 'sprint', id: sprint.id }, event)}><Icon name="grip" size={14} /></span>
            : <span className="timeline-handle is-empty" aria-hidden="true" />}
          <FoldButton folded={folded} label={name} onToggle={() => toggleSprintFolded(row.id)} />
          {sprint
            ? <button type="button" className="timeline-name" onClick={() => onEdit({ kind: 'sprint', id: sprint.id })}>{name}</button>
            : <span className="timeline-name is-static">{name}</span>}
          <span className="timeline-count">{row.count}</span>
          <button type="button" className="timeline-add" aria-label={`Add an epic to ${name}`} data-tooltip="Add an epic" onClick={() => onEdit({ kind: 'item', type: 'epic', sprintId: sprint ? sprint.id : '' })}>
            <Icon name="plus" size={14} />
          </button>
        </div>
        <div className="timeline-cell-status"><Progress percent={completion.percent} label={`${completion.done} of ${completion.total} tasks done`} /></div>
        <div className="timeline-cell-assignee"><span className="timeline-dates">{sprint ? dayRange(sprint.start, sprint.end) : 'No sprint'}</span></div>
      </div>
      <div className="timeline-lane">
        {sprint && (
          <button
            type="button"
            className="timeline-bar is-sprint"
            style={{ left: xOf(scale, sprint.start), width: widthOf(scale, sprint.start, sprint.end) }}
            aria-label={`${name}, ${dayRange(sprint.start, sprint.end)}`}
            onClick={() => onEdit({ kind: 'sprint', id: sprint.id })}
          >
            <span>{name}</span>
          </button>
        )}
      </div>
    </div>
  );
}

type ItemRowProps = RowProps & {
  row: ItemRow;
  barDrag: BarDrag | null;
  onBarPointerDown: (item: WorkItem, event: ReactPointerEvent<HTMLElement>) => void;
};

function ItemRowView({ row, scale, board, dropHint, onEdit, onRowDragStart, barDrag, onBarPointerDown }: ItemRowProps) {
  const { item } = row;
  const folded = Boolean(board.collapsedItems[item.id]);
  const dates = barDrag?.id === item.id && barDrag.moved ? barDrag.dates : item;
  const hint = dropHint?.key === `item:${item.id}` ? `is-drop-${dropHint.mode}` : '';
  const isEpic = item.type === 'epic';
  const completion = isEpic ? epicCompletion(board.items, item.id) : null;

  /* An item whose parent is shown in another sprint says so, since its parent is not above it. */
  const parent = board.items.find(entry => entry.id === item.parentId);
  const elsewhere = parent && shownSprintOf(board, parent) !== shownSprintOf(board, item) ? ` · inside ${parent.name}` : '';

  function handleBarKey(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onEdit({ kind: 'item', id: item.id });
    }
  }

  return (
    <div className={`timeline-row ${hint}`} data-row-item={item.id}>
      <div className="timeline-meta">
        <div className="timeline-cell-work" style={{ paddingLeft: 4 + Math.min(row.depth, 7) * 16 }}>
          <span className="timeline-handle" draggable aria-label={`Drag ${item.name} to move it`} data-tooltip="Drag to move" onDragStart={event => onRowDragStart({ kind: 'item', id: item.id }, event)}><Icon name="grip" size={14} /></span>
          <FoldButton folded={folded} label={item.name} onToggle={row.children ? () => toggleItemFolded(item.id) : undefined} />
          <WorkTypeIcon type={item.type} />
          <button type="button" className="timeline-name" title={`${item.name}${elsewhere}`} onClick={() => onEdit({ kind: 'item', id: item.id })}>{item.name}</button>
          {row.children > 0 && <span className="timeline-count">{row.children}</span>}
          <button type="button" className="timeline-add" aria-label={`Add work inside ${item.name}`} data-tooltip={`Add a ${WORK_TYPES[childType(item)].label.toLowerCase()}`} onClick={() => onEdit({ kind: 'item', type: childType(item), parentId: item.id, sprintId: shownSprintOf(board, item) })}>
            <Icon name="plus" size={14} />
          </button>
        </div>
        <div className="timeline-cell-status">
          {completion
            ? <Progress percent={completion.percent} label={completion.total ? `${completion.done} of ${completion.total} tasks done` : 'No tasks yet'} />
            : <StatusPicker item={item} />}
        </div>
        <div className="timeline-cell-assignee">
          <AssigneePicker item={item} board={board} />
        </div>
      </div>
      <div className="timeline-lane">
        <span
          className={`timeline-bar is-work ${isEpic ? 'is-epic' : ''} ${barDrag?.id === item.id ? 'is-dragging' : ''}`}
          role="button"
          tabIndex={0}
          aria-label={`${item.name}, ${dayRange(dates.start, dates.end)}. Drag to move, drag an end to change its length, or press Enter to edit.`}
          style={{ '--bar-color': item.color, left: xOf(scale, dates.start), width: widthOf(scale, dates.start, dates.end) } as CSSProperties}
          onPointerDown={event => onBarPointerDown(item, event)}
          onKeyDown={handleBarKey}
        >
          <i className="timeline-bar-end is-start" data-edge="start" aria-hidden="true" />
          <span>{item.name}</span>
          {completion && <em>{completion.percent}%</em>}
          <i className="timeline-bar-end is-end" data-edge="end" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}


/* =========================
   Column Widths
   ========================= */

/* How far one press of ← or → moves a column's edge (Shift moves it further). */
const RESIZE_STEP = 16;

/* The edge at the right of a column's heading. Drag it to make the column narrower or wider on */
/* every row, or use ← and → once it has focus; double-click it for the first width again. The */
/* width follows the pointer straight away and is remembered when the drag ends. */
function ColumnResizer({ column, label }: { column: TimelineColumn; label: string }) {
  const { timelineColumns } = usePreferences();
  const width = timelineColumns[column];
  const drag = useRef<{ startX: number; startWidth: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  function save(next: number) {
    updatePreferences({ timelineColumns: { ...getPreferences().timelineColumns, [column]: clampColumn(column, next) } });
  }

  /* While dragging, only the card's variable changes; the preference is saved once, at the end. */
  function show(target: Element, next: number) {
    target.closest<HTMLElement>('.timeline-card')?.style.setProperty(`--${column}-width`, `${next}px`);
  }

  function start(event: ReactPointerEvent<HTMLSpanElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width, width };
    setDragging(true);
  }

  function move(event: ReactPointerEvent<HTMLSpanElement>) {
    const current = drag.current;
    if (!current) return;
    current.width = clampColumn(column, current.startWidth + event.clientX - current.startX);
    show(event.currentTarget, current.width);
  }

  function end() {
    const current = drag.current;
    drag.current = null;
    setDragging(false);
    if (current && current.width !== current.startWidth) save(current.width);
  }

  function handleKey(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = (event.shiftKey ? 4 : 1) * RESIZE_STEP;
    save(width + (event.key === 'ArrowRight' ? step : -step));
  }

  const limits = TIMELINE_COLUMNS[column];
  return (
    <span
      className={`timeline-resizer ${dragging ? 'is-dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize the ${label} column`}
      aria-valuenow={width}
      aria-valuemin={limits.min}
      aria-valuemax={limits.max}
      tabIndex={0}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => save(limits.initial)}
      onKeyDown={handleKey}
    />
  );
}


/* =========================
   Timeline
   ========================= */

/* The Gantt timeline of Boardspace: sprints (then the backlog) with their epics, features and */
/* tasks as a tree on the left, and bars on a calendar on the right. Drag a bar to move it, or */
/* an end to change its length (snapping to the Day, Week or Month scale); click it (or Enter) */
/* to edit. Drag a row's handle to reorder it, or drop it inside another item or onto a sprint. */
/* It sits in the project frame, which opens the editor (onEdit). */
export function Timeline({ onEdit }: { onEdit: (target: EditorTarget) => void }) {
  const board = useBoard();
  const { timelineColumns } = usePreferences();
  const [zoom, setZoom] = useState<Zoom>('week');
  const [search, setSearch] = useState('');
  const [wide, setWide] = useState(false);
  const [barDrag, setBarDrag] = useState<BarDrag | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const [narrow, setNarrow] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowDrag = useRef<RowDrag | null>(null);

  const scale = useMemo(() => timelineScale(board, zoom), [board, zoom]);
  const rows = useMemo(() => timelineRows(board, search), [board, search]);
  const months = useMemo(() => monthBands(scale), [scale]);
  const ticks = useMemo(() => dayTicks(scale), [scale]);
  const todayX = xOf(scale, today()) + scale.dayWidth / 2;
  const empty = !board.items.length && !board.sprints.length;

  /* The card's width is measured (not a CSS container query, which would also hold the editor */
  /* panel, a fixed overlay, inside the card). */
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const observer = new ResizeObserver(() => setNarrow(card.clientWidth < NARROW_CARD));
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  /* Today is brought into view when the timeline opens and when the scale or the columns */
  /* change, a third of the way along the visible calendar. */
  function scrollToToday() {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const meta = scroller.querySelector<HTMLElement>('.timeline-head .timeline-meta')?.offsetWidth ?? 0;
    scroller.scrollLeft = Math.max(0, todayX - (scroller.clientWidth - meta) / 3);
  }
  useLayoutEffect(scrollToToday, [zoom, narrow, wide]);

  /* Dragging bars. */
  function startBarDrag(item: WorkItem, event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || barDrag) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const edge = (event.target as Element).closest<HTMLElement>('[data-edge]')?.dataset.edge as DragMode | undefined;
    setBarDrag({ pointerId: event.pointerId, id: item.id, mode: edge ?? 'move', startX: event.clientX, start: item.start, end: item.end, moved: false, dates: { start: item.start, end: item.end }, x: event.clientX, y: event.clientY });
  }

  function moveBarDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!barDrag || event.pointerId !== barDrag.pointerId) return;
    const dx = event.clientX - barDrag.startX;
    if (!barDrag.moved && Math.abs(dx) < DRAG_SLOP) return;
    setBarDrag({ ...barDrag, moved: true, dates: draggedDates(barDrag.mode, barDrag.start, barDrag.end, dx, scale), x: event.clientX, y: event.clientY });
  }

  function endBarDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!barDrag || event.pointerId !== barDrag.pointerId) return;
    const current = barDrag;
    setBarDrag(null);
    if (event.type === 'pointercancel') return;
    if (!current.moved) {
      if (current.mode === 'move') onEdit({ kind: 'item', id: current.id });
      return;
    }
    const { start, end } = current.dates;
    if (start === current.start && end === current.end) return;
    setDates(current.id, start, end);
    showToast({ kind: 'success', title: 'Dates changed', description: dayRange(start, end) });
  }

  /* Dragging rows by their handles. */
  function startRowDrag(drag: RowDrag, event: DragEvent) {
    rowDrag.current = drag;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', drag.id);
  }

  /* Where a row dragged over another would land: onto a sprint heading (into that sprint), or */
  /* in the top quarter of an item (before it), the bottom quarter (after it) or the middle */
  /* (inside it). Sprints can only be dropped onto other sprints. */
  function dropAt(event: DragEvent): { hint: DropHint; drop: Drop | null; sprintOnto?: string } | null {
    const drag = rowDrag.current;
    const row = (event.target as Element).closest<HTMLElement>('[data-row-sprint], [data-row-item]');
    if (!drag || !row) return null;
    const sprintId = row.dataset.rowSprint;
    if (sprintId !== undefined) {
      if (drag.kind === 'sprint') return sprintId !== BACKLOG && sprintId !== drag.id ? { hint: { key: `sprint:${sprintId}`, mode: 'section' }, drop: null, sprintOnto: sprintId } : null;
      const drop: Drop = { mode: 'section', sprintId: sprintId === BACKLOG ? '' : sprintId };
      return canDrop(board, drag.id, drop) ? { hint: { key: `sprint:${sprintId}`, mode: 'section' }, drop } : null;
    }
    if (drag.kind === 'sprint') return null;
    const box = row.getBoundingClientRect();
    const share = (event.clientY - box.top) / box.height;
    const mode = share < 0.27 ? 'before' : share > 0.73 ? 'after' : 'inside';
    const drop: Drop = { mode, targetId: row.dataset.rowItem as string };
    return canDrop(board, drag.id, drop) ? { hint: { key: `item:${drop.targetId}`, mode }, drop } : null;
  }

  function handleDragOver(event: DragEvent) {
    const spot = dropAt(event);
    setDropHint(spot?.hint ?? null);
    if (!spot) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(event: DragEvent) {
    const spot = dropAt(event);
    const drag = rowDrag.current;
    setDropHint(null);
    rowDrag.current = null;
    if (!spot || !drag) return;
    event.preventDefault();
    if (spot.sprintOnto) moveSprint(drag.id, spot.sprintOnto);
    else if (spot.drop) moveWork(drag.id, spot.drop);
  }

  return (
    <section
      ref={cardRef}
      className={`timeline-card ${wide || narrow ? 'is-wide' : ''}`}
      aria-label="Timeline"
      style={{ '--work-width': `${timelineColumns.work}px`, '--status-width': `${timelineColumns.status}px`, '--assignee-width': `${timelineColumns.assignee}px` } as CSSProperties}
    >
      <div className="board-tools">
        <label className="board-search">
          <Icon name="search" size={15} />
          <input aria-label="Search work" placeholder="Search work" value={search} onChange={event => setSearch(event.target.value)} />
          {search && <button type="button" className="board-search-clear" aria-label="Clear the search" onClick={() => setSearch('')}><Icon name="x" size={13} /></button>}
        </label>
        <span className="board-counts">{board.items.length} {board.items.length === 1 ? 'item' : 'items'} · {board.sprints.length} {board.sprints.length === 1 ? 'sprint' : 'sprints'}</span>
        <span className="board-fill" />
        <button type="button" className="btn btn-quiet btn-sm" onClick={scrollToToday}>Today</button>
        <span className="timeline-zoom" role="radiogroup" aria-label="Scale">
          {ZOOMS.map(option => (
            <button key={option.value} type="button" role="radio" aria-checked={zoom === option.value} className={zoom === option.value ? 'is-active' : ''} onClick={() => setZoom(option.value)}>{option.label}</button>
          ))}
        </span>
        {!narrow && <button type="button" className={`page-bar-button ${wide ? 'selected' : ''}`} aria-pressed={wide} aria-label={wide ? 'Show the Status and Assignee columns' : 'Hide the Status and Assignee columns'} data-tooltip={wide ? 'Show columns' : 'More room for the timeline'} data-tooltip-align="end" onClick={() => setWide(!wide)}>
          <Icon name="scan" size={16} />
        </button>}
      </div>

      <div className="timeline-body">
        <div
          ref={scrollRef}
          className="timeline-scroll"
          style={{ '--lane-width': `${scale.width}px`, '--week-width': `${scale.dayWidth * 7}px`, '--today-x': `${todayX}px` } as CSSProperties}
          onPointerMove={moveBarDrag}
          onPointerUp={endBarDrag}
          onPointerCancel={endBarDrag}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragEnd={() => { setDropHint(null); rowDrag.current = null; }}
        >
          <div className="timeline-grid">
            <div className="timeline-row timeline-head">
              <div className="timeline-meta">
                <span className="timeline-cell-work">Work<ColumnResizer column="work" label="Work" /></span>
                <span className="timeline-cell-status">Status<ColumnResizer column="status" label="Status" /></span>
                <span className="timeline-cell-assignee">Assignee<ColumnResizer column="assignee" label="Assignee" /></span>
              </div>
              <div className="timeline-lane">
                <div className="timeline-months">{months.map(month => <span key={month.key} style={{ left: month.left, width: month.width }}>{month.label}</span>)}</div>
                <div className="timeline-ticks">{ticks.map(tick => <span key={tick.key} className={tick.current ? 'is-current' : ''} style={{ left: tick.left, width: tick.width }}>{tick.label}</span>)}</div>
              </div>
            </div>

            {rows.map(row => (row.kind === 'sprint'
              ? <SprintRowView key={`sprint:${row.id}`} row={row} scale={scale} board={board} dropHint={dropHint} onEdit={onEdit} onRowDragStart={startRowDrag} />
              : <ItemRowView key={row.item.id} row={row} scale={scale} board={board} dropHint={dropHint} onEdit={onEdit} onRowDragStart={startRowDrag} barDrag={barDrag} onBarPointerDown={startBarDrag} />))}
          </div>

          {!empty && search && !rows.length && <p className="timeline-no-match">No work matches “{search}”.</p>}
        </div>

        {/* Over the grid rather than in it, so it stays in view however far the calendar scrolls. */}
        {empty && (
          <div className="timeline-empty">
            <Icon name="calendar-days" size={28} />
            <h3>Make a plan, see the timeline.</h3>
            <p>Add a sprint, or your first piece of work, to start mapping out the project.</p>
            <button type="button" className="btn btn-primary" onClick={() => onEdit({ kind: 'sprint' })}><Icon name="plus" size={16} /> Add a sprint</button>
          </div>
        )}
      </div>

      {barDrag?.moved && (
        <span className="timeline-drag-label" role="status" style={{ left: Math.min(barDrag.x + 12, window.innerWidth - 170), top: Math.max(8, barDrag.y - 40) }}>
          {dayRange(barDrag.dates.start, barDrag.dates.end)}
        </span>
      )}

    </section>
  );
}
