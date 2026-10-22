import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { Avatar } from '../../components/Avatar';
import { Dropdown } from '../../components/Dropdown';
import { Icon } from '../../components/Icon';
import { showToast } from '../../lib/toasts';
import type { BoardProject, WorkItem, WorkStatus } from '../../../shared/types/board';
import { setStatus, useBoard } from '../board';
import { shortDay } from '../dates';
import { assigneeChoices, sprintChoices } from '../list/listRows';
import { initialsOf, shownSprintOf, WORK_STATUSES } from '../workItems';
import type { EditorTarget } from '../WorkEditor';
import { WorkTypeIcon } from '../workParts';
import { boardColumns, currentSprint, isOverdue, type BoardFilters } from './boardColumns';

const STATUSES = Object.keys(WORK_STATUSES) as WorkStatus[];

/* The drag data type for a card, so a card dropped anywhere else (a note, say) is never text. */
const CARD_DRAG_TYPE = 'application/x-starjot-card';


/* =========================
   Work Board
   ========================= */

/* The project's features and tasks as cards in a column per status, like Jira's board. A card */
/* is dragged to another column (or moved with Alt + ← / → from its name) to change its status; */
/* its name opens the editor. Search, Assignee and Sprint narrow the cards; the board opens on */
/* the sprint today falls in, when there is one. */
export function WorkBoard({ onEdit }: { onEdit: (target: EditorTarget) => void }) {
  const board = useBoard();
  const [filters, setFilters] = useState<BoardFilters>(() => ({ search: '', assignee: '', sprint: currentSprint(board) }));
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<WorkStatus | null>(null);
  const columns = useMemo(() => boardColumns(board, filters), [board, filters]);
  const shown = columns.reduce((total, column) => total + column.items.length, 0);
  const all = board.items.filter(item => item.type !== 'epic').length;
  const filtered = Boolean(filters.search.trim() || filters.assignee || filters.sprint);
  const filter = (changes: Partial<BoardFilters>) => setFilters(current => ({ ...current, ...changes }));

  /* A card moved with the keyboard lands in another column, so its name is focused again there. */
  const moved = useRef<string | null>(null);
  useEffect(() => {
    if (!moved.current) return;
    document.querySelector<HTMLButtonElement>(`[data-card="${moved.current}"] .board-card-name`)?.focus();
    moved.current = null;
  });

  function move(item: WorkItem, status: WorkStatus) {
    if (item.status === status) return;
    setStatus(item.id, status);
    showToast({ kind: 'success', title: `Moved to ${WORK_STATUSES[status]}`, description: item.name });
  }

  function dropOn(event: DragEvent, status: WorkStatus) {
    event.preventDefault();
    const item = board.items.find(entry => entry.id === dragging);
    setDragging(null);
    setOver(null);
    if (item) move(item, status);
  }

  function cardKeys(event: KeyboardEvent, item: WorkItem) {
    if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    const next = STATUSES[STATUSES.indexOf(item.status) + (event.key === 'ArrowLeft' ? -1 : 1)];
    if (!next) return;
    moved.current = item.id;
    move(item, next);
  }

  return (
    <section className="work-board-card" aria-label="Board">
      <div className="board-tools">
        <label className="board-search">
          <Icon name="search" size={15} />
          <input aria-label="Search work" placeholder="Search work" value={filters.search} onChange={event => filter({ search: event.target.value })} />
          {filters.search && <button type="button" className="board-search-clear" aria-label="Clear the search" onClick={() => filter({ search: '' })}><Icon name="x" size={13} /></button>}
        </label>
        <Dropdown
          label="Assignee"
          prefix="Assignee"
          className={`board-filter ${filters.assignee ? 'is-active' : ''}`}
          value={filters.assignee}
          options={assigneeChoices(board.members)}
          onChange={assignee => filter({ assignee })}
        />
        <Dropdown
          label="Sprint"
          prefix="Sprint"
          className={`board-filter ${filters.sprint ? 'is-active' : ''}`}
          value={filters.sprint}
          options={sprintChoices(board.sprints)}
          onChange={sprint => filter({ sprint })}
        />
        {filtered && <button type="button" className="btn btn-quiet btn-sm" onClick={() => setFilters({ search: '', assignee: '', sprint: '' })}>Clear</button>}
        <span className="board-fill" />
        <span className="board-counts">{filtered ? `${shown} of ${all}` : all} {all === 1 ? 'card' : 'cards'}</span>
      </div>

      {!all ? (
        <div className="work-list-empty">
          <Icon name="kanban" size={28} />
          <h3>No work yet.</h3>
          <p>Features and tasks you add show here as cards, in a column for each status.</p>
          <button type="button" className="btn btn-primary" onClick={() => onEdit({ kind: 'item', type: 'task' })}><Icon name="plus" size={16} /> Add a task</button>
        </div>
      ) : (
        <div className="board-columns">
          {columns.map(column => (
            <div
              key={column.status}
              className={`board-column ${over === column.status ? 'is-over' : ''}`}
              role="group"
              aria-label={`${WORK_STATUSES[column.status]}, ${column.items.length} ${column.items.length === 1 ? 'card' : 'cards'}`}
              onDragOver={event => {
                if (!dragging) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setOver(column.status);
              }}
              onDragLeave={event => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(current => (current === column.status ? null : current));
              }}
              onDrop={event => dropOn(event, column.status)}
            >
              <h3 className="board-column-head">
                <span className={`work-status-dot work-status-dot--${column.status}`} />
                {WORK_STATUSES[column.status]}
                <span className="tab-count">{column.items.length}</span>
              </h3>
              <div className="board-column-cards">
                {column.items.map(item => (
                  <WorkCard
                    key={item.id}
                    item={item}
                    board={board}
                    dragging={dragging === item.id}
                    onOpen={() => onEdit({ kind: 'item', id: item.id })}
                    onKeyDown={event => cardKeys(event, item)}
                    onDragStart={event => {
                      event.dataTransfer.setData(CARD_DRAG_TYPE, item.id);
                      event.dataTransfer.effectAllowed = 'move';
                      setDragging(item.id);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                  />
                ))}
                {!column.items.length && <p className="board-column-empty">{dragging ? 'Drop here' : 'Nothing here'}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      {all > 0 && !shown && <p className="work-list-none">No cards match these filters.</p>}
    </section>
  );
}

type WorkCardProps = {
  item: WorkItem;
  board: BoardProject;
  dragging: boolean;
  onOpen: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
};

/* One card: its kind and name, what it sits inside, its sprint, due date (red once overdue) */
/* and assignee. */
function WorkCard({ item, board, dragging, onOpen, onKeyDown, onDragStart, onDragEnd }: WorkCardProps) {
  const parent = board.items.find(entry => entry.id === item.parentId);
  const sprint = board.sprints.find(entry => entry.id === shownSprintOf(board, item));
  const overdue = isOverdue(item);
  return (
    <article className={`board-card ${dragging ? 'is-dragging' : ''}`} data-card={item.id} draggable onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="board-card-top">
        <WorkTypeIcon type={item.type} />
        <button type="button" className="board-card-name" onClick={onOpen} onKeyDown={onKeyDown} data-tooltip="Open" data-shortcut="Alt + ← / → to move">
          {item.name}
        </button>
      </div>
      {parent && <small className="board-card-parent">in {parent.name}</small>}
      <div className="board-card-foot">
        <span className="board-card-sprint">{sprint ? sprint.name : 'Backlog'}</span>
        {item.end && (
          <span className={`board-card-due ${overdue ? 'is-overdue' : ''}`} aria-label={`${overdue ? 'Overdue, due' : 'Due'} ${shortDay(item.end)}`}>
            <Icon name={overdue ? 'alert-triangle' : 'calendar-days'} size={12} />{shortDay(item.end)}
          </span>
        )}
        <span className="board-card-person" data-tooltip={item.assignee || 'Unassigned'} aria-label={item.assignee || 'Unassigned'}>
          <Avatar initials={item.assignee ? initialsOf(item.assignee) : '–'} className={`work-avatar ${item.assignee ? '' : 'is-nobody'}`} />
        </span>
      </div>
    </article>
  );
}
