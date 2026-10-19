import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Avatar } from '../../components/Avatar';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dropdown } from '../../components/Dropdown';
import { Icon, type IconName } from '../../components/Icon';
import { useDismiss } from '../../lib/useDismiss';
import { showToast } from '../../lib/toasts';
import type { BoardProject, WorkItem, WorkStatus, WorkType } from '../../../shared/types/board';
import { dayRange, today } from '../dates';
import {
  canDrop, moveSprint, moveWork, replaceBoard, setAssignee, setBoardTitle, setDates, setStatus, TITLE_LENGTH, toggleItemFolded, toggleSprintFolded, useBoard, type Drop
} from '../board';
import { BACKLOG, childType, epicCompletion, initialsOf, shownSprintOf, sprintCompletion, timelineRows, WORK_STATUSES, WORK_TYPES, type ItemRow, type SprintRow } from '../workItems';
import { dayTicks, draggedDates, monthBands, timelineScale, widthOf, xOf, ZOOMS, type DragMode, type Scale, type Zoom } from './scale';
import { exportBackup, exportCsv, exportPng, exportSvg, readProjectFile } from './files';
import { MembersDialog } from './MembersDialog';
import { WorkEditor, type EditorTarget } from './WorkEditor';

/* The icon beside each kind of work. */
const TYPE_ICONS: Record<WorkType, IconName> = { epic: 'layers', feature: 'blocks', task: 'check-square' };

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
   Menus
   ========================= */

type MenuItem = { key: string; label: string; hint: string; icon: IconName; divider?: boolean; run: () => void };

/* A button that opens a small menu of choices under it (Create, Export). */
function MenuButton({ label, icon, primary = false, items }: { label: string; icon: IconName; primary?: boolean; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLSpanElement>(null);
  useDismiss(open, `[data-menu="${label}"]`, () => setOpen(false));
  useEffect(() => {
    if (open) holder.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [open]);
  return (
    <span className="board-menu" data-menu={label} ref={holder}>
      <button type="button" className={`btn ${primary ? 'btn-primary' : 'btn-secondary'}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name={icon} size={16} /><span>{label}</span><Icon name="chevron-down" size={14} />
      </button>
      {open && (
        <span className="page-menu board-menu-items" role="menu" aria-label={label}>
          {items.map(item => (
            <span key={item.key}>
              {item.divider && <span className="board-menu-divider" role="separator" />}
              <button type="button" role="menuitem" className="page-menu-item" onClick={() => { setOpen(false); item.run(); }}>
                <Icon name={item.icon} size={16} />
                <span className="board-menu-text">{item.label}<small>{item.hint}</small></span>
              </button>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}


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

/* A bar of progress with its percentage beside it. */
function Progress({ percent, label }: { percent: number; label: string }) {
  return (
    <span className="timeline-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} data-tooltip={label}>
      <span className="timeline-progress-track"><b style={{ width: `${percent}%` }} /></span>
      <span className="timeline-progress-value">{percent}%</span>
    </span>
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
  const members = [...board.members];
  if (item.assignee && !members.includes(item.assignee)) members.push(item.assignee);

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
          <span className={`timeline-type is-${item.type}`} data-tooltip={WORK_TYPES[item.type].label}><Icon name={TYPE_ICONS[item.type]} size={12} /></span>
          <button type="button" className="timeline-name" title={`${item.name}${elsewhere}`} onClick={() => onEdit({ kind: 'item', id: item.id })}>{item.name}</button>
          {row.children > 0 && <span className="timeline-count">{row.children}</span>}
          <button type="button" className="timeline-add" aria-label={`Add work inside ${item.name}`} data-tooltip={`Add a ${WORK_TYPES[childType(item)].label.toLowerCase()}`} onClick={() => onEdit({ kind: 'item', type: childType(item), parentId: item.id, sprintId: shownSprintOf(board, item) })}>
            <Icon name="plus" size={14} />
          </button>
        </div>
        <div className="timeline-cell-status">
          {completion
            ? <Progress percent={completion.percent} label={completion.total ? `${completion.done} of ${completion.total} tasks done` : 'No tasks yet'} />
            : (
              <Dropdown
                label={`Status of ${item.name}`}
                className={`timeline-status is-${item.status}`}
                value={item.status}
                options={(Object.keys(WORK_STATUSES) as WorkStatus[]).map(status => ({ value: status, label: WORK_STATUSES[status] }))}
                onChange={status => setStatus(item.id, status)}
              />
            )}
        </div>
        <div className="timeline-cell-assignee">
          <Avatar initials={item.assignee ? initialsOf(item.assignee) : '–'} className="timeline-avatar" />
          <Dropdown
            label={`Assignee of ${item.name}`}
            className="timeline-assignee"
            value={item.assignee}
            options={[{ value: '', label: 'Unassigned' }, ...members.sort((a, b) => a.localeCompare(b)).map(name => ({ value: name, label: name }))]}
            onChange={name => setAssignee(item.id, name)}
          />
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
   Timeline
   ========================= */

/* The Gantt timeline of Boardspace: sprints (then the backlog) with their epics, features and */
/* tasks as a tree on the left, and bars on a calendar on the right. Drag a bar to move it, or */
/* an end to change its length (snapping to the Day, Week or Month scale); click it (or Enter) */
/* to edit. Drag a row's handle to reorder it, or drop it inside another item or onto a sprint. */
/* The project saves in this browser; Export makes a picture, a spreadsheet or a backup. */
export function Timeline() {
  const board = useBoard();
  const [zoom, setZoom] = useState<Zoom>('week');
  const [search, setSearch] = useState('');
  const [wide, setWide] = useState(false);
  const [editing, setEditing] = useState<EditorTarget | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [importing, setImporting] = useState<{ project: BoardProject; message: string; warning: boolean } | null>(null);
  const [barDrag, setBarDrag] = useState<BarDrag | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const [title, setTitle] = useState(board.title);
  const [narrow, setNarrow] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rowDrag = useRef<RowDrag | null>(null);

  const scale = useMemo(() => timelineScale(board, zoom), [board, zoom]);
  const rows = useMemo(() => timelineRows(board, search), [board, search]);
  const months = useMemo(() => monthBands(scale), [scale]);
  const ticks = useMemo(() => dayTicks(scale), [scale]);
  const todayX = xOf(scale, today()) + scale.dayWidth / 2;
  const empty = !board.items.length && !board.sprints.length;

  useEffect(() => setTitle(board.title), [board.title]);

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
      if (current.mode === 'move') setEditing({ kind: 'item', id: current.id });
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

  /* Import and export. */
  async function chooseFile(file: File | undefined) {
    if (!file) return;
    try {
      const result = await readProjectFile(file);
      if (empty) finishImport(result);
      else setImporting(result);
    } catch (error) {
      showToast({ kind: 'error', title: 'Import failed', description: `${(error as Error).message} Your project was not changed.` });
    }
  }

  function finishImport(result: { project: BoardProject; message: string; warning: boolean }) {
    replaceBoard(result.project);
    setImporting(null);
    setSearch('');
    showToast({ kind: result.warning ? 'error' : 'success', title: 'Project imported', description: result.message, stay: result.warning });
  }

  async function exportAs(run: () => void | Promise<void>, done: string) {
    try {
      await run();
      showToast({ kind: 'success', title: done });
    } catch {
      showToast({ kind: 'error', title: 'The export did not work', description: 'Try the SVG picture instead.' });
    }
  }

  const lastSprint = [...board.sprints].sort((a, b) => a.order - b.order).at(-1)?.id ?? '';
  const createItems: MenuItem[] = [
    ...(['epic', 'feature', 'task'] as WorkType[]).map(type => ({ key: type, label: WORK_TYPES[type].label, hint: WORK_TYPES[type].hint, icon: TYPE_ICONS[type], run: () => setEditing({ kind: 'item', type, sprintId: lastSprint }) })),
    { key: 'sprint', label: 'Sprint', hint: 'A planning period', icon: 'calendar-days', divider: true, run: () => setEditing({ kind: 'sprint' }) }
  ];
  const exportItems: MenuItem[] = [
    { key: 'png', label: 'PNG picture', hint: 'The whole timeline', icon: 'image', run: () => exportAs(() => exportPng(board), 'PNG picture saved') },
    { key: 'svg', label: 'SVG picture', hint: 'Sharp at any size', icon: 'image', run: () => exportAs(() => exportSvg(board), 'SVG picture saved') },
    { key: 'csv', label: 'CSV spreadsheet', hint: 'Edit in Excel, then import', icon: 'table', run: () => exportAs(() => exportCsv(board), 'CSV spreadsheet saved') },
    { key: 'json', label: 'Project backup', hint: 'Everything, to import later', icon: 'download', run: () => exportAs(() => exportBackup(board), 'Project backup saved') }
  ];

  return (
    <section ref={cardRef} className={`timeline-card ${wide || narrow ? 'is-wide' : ''}`} aria-label="Timeline">
      <div className="timeline-top">
        <input
          className="timeline-title"
          aria-label="Project name"
          maxLength={TITLE_LENGTH}
          value={title}
          onChange={event => setTitle(event.target.value)}
          onBlur={() => setBoardTitle(title)}
          onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        />
        <span className="timeline-fill" />
        <button type="button" className="btn btn-quiet" onClick={() => fileRef.current?.click()} data-tooltip="Open a project backup or a CSV spreadsheet (from Excel or Jira)" data-tooltip-wrap="" data-tooltip-align="end">
          <Icon name="upload" size={16} /><span>Import</span>
        </button>
        <input ref={fileRef} type="file" hidden accept=".json,.csv,.txt,application/json,text/csv,text/plain" onChange={event => { void chooseFile(event.target.files?.[0]); event.target.value = ''; }} />
        <MenuButton label="Export" icon="download" items={exportItems} />
        <button type="button" className="btn btn-secondary" onClick={() => setMembersOpen(true)}><Icon name="users" size={16} /><span>Members</span></button>
        <MenuButton label="Create" icon="plus" primary items={createItems} />
      </div>

      <div className="timeline-tools">
        <label className="timeline-search">
          <Icon name="search" size={15} />
          <input aria-label="Search work" placeholder="Search work" value={search} onChange={event => setSearch(event.target.value)} />
          {search && <button type="button" className="timeline-search-clear" aria-label="Clear the search" onClick={() => setSearch('')}><Icon name="x" size={13} /></button>}
        </label>
        <span className="timeline-counts">{board.items.length} {board.items.length === 1 ? 'item' : 'items'} · {board.sprints.length} {board.sprints.length === 1 ? 'sprint' : 'sprints'}</span>
        <span className="timeline-fill" />
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
                <span className="timeline-cell-work">Work</span>
                <span className="timeline-cell-status">Status</span>
                <span className="timeline-cell-assignee">Assignee</span>
              </div>
              <div className="timeline-lane">
                <div className="timeline-months">{months.map(month => <span key={month.key} style={{ left: month.left, width: month.width }}>{month.label}</span>)}</div>
                <div className="timeline-ticks">{ticks.map(tick => <span key={tick.key} className={tick.current ? 'is-current' : ''} style={{ left: tick.left, width: tick.width }}>{tick.label}</span>)}</div>
              </div>
            </div>

            {rows.map(row => (row.kind === 'sprint'
              ? <SprintRowView key={`sprint:${row.id}`} row={row} scale={scale} board={board} dropHint={dropHint} onEdit={setEditing} onRowDragStart={startRowDrag} />
              : <ItemRowView key={row.item.id} row={row} scale={scale} board={board} dropHint={dropHint} onEdit={setEditing} onRowDragStart={startRowDrag} barDrag={barDrag} onBarPointerDown={startBarDrag} />))}
          </div>

          {!empty && search && !rows.length && <p className="timeline-no-match">No work matches “{search}”.</p>}
        </div>

        {/* Over the grid rather than in it, so it stays in view however far the calendar scrolls. */}
        {empty && (
          <div className="timeline-empty">
            <Icon name="calendar-days" size={28} />
            <h3>Make a plan, see the timeline.</h3>
            <p>Add a sprint, or your first piece of work, to start mapping out the project.</p>
            <button type="button" className="btn btn-primary" onClick={() => setEditing({ kind: 'sprint' })}><Icon name="plus" size={16} /> Add a sprint</button>
          </div>
        )}
      </div>

      {barDrag?.moved && (
        <span className="timeline-drag-label" role="status" style={{ left: Math.min(barDrag.x + 12, window.innerWidth - 170), top: Math.max(8, barDrag.y - 40) }}>
          {dayRange(barDrag.dates.start, barDrag.dates.end)}
        </span>
      )}

      {editing && <WorkEditor key={JSON.stringify(editing)} target={editing} onClose={() => setEditing(null)} onManageMembers={() => setMembersOpen(true)} />}
      {membersOpen && <MembersDialog onClose={() => setMembersOpen(false)} />}
      {importing && (
        <ConfirmDialog title="Replace this project?" confirmLabel="Import" onConfirm={() => finishImport(importing)} onCancel={() => setImporting(null)}>
          The file holds {importing.message.charAt(0).toLowerCase()}{importing.message.slice(1)} It replaces everything in the current project, so export a project backup first if you may want it back.
        </ConfirmDialog>
      )}
    </section>
  );
}
