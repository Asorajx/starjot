import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Dropdown } from '../../components/Dropdown';
import { Icon } from '../../components/Icon';
import type { WorkStatus, WorkType } from '../../../shared/types/board';
import { shortDay } from '../dates';
import { useBoard } from '../board';
import { BACKLOG, epicCompletion, shownSprintOf, sprintOrder, WORK_STATUSES, WORK_TYPES } from '../workItems';
import type { EditorTarget } from '../WorkEditor';
import { AssigneePicker, Progress, StatusPicker, WorkTypeIcon } from '../workParts';
import { listRows, NO_FILTERS, NOBODY, type ListFilters, type ListSort, type SortKey } from './listRows';

/* The columns that sort the list when their heading is clicked. */
const COLUMNS: { key: SortKey; label: string; className: string }[] = [
  { key: 'name', label: 'Work', className: 'work-list-name' },
  { key: 'status', label: 'Status', className: 'work-list-status' },
  { key: 'assignee', label: 'Assignee', className: 'work-list-assignee' },
  { key: 'sprint', label: 'Sprint', className: 'work-list-sprint' },
  { key: 'start', label: 'Start', className: 'work-list-start' },
  { key: 'end', label: 'Due', className: 'work-list-end' }
];

/* Below these widths (of the list's card) the list drops columns so it never needs to scroll */
/* sideways, which would clip the status and assignee menus: first the sprint and dates, then */
/* the assignee. */
const NARROW_LIST = 760;
const SLIM_LIST = 520;


/* =========================
   Work List
   ========================= */

/* Every piece of work in the project as a table, like Jira's list: its kind and name (with what */
/* it sits inside), status, assignee, sprint and dates. Search and the filters narrow it; a */
/* column's heading sorts by it (again for the other way, a third time back to the project's */
/* order). Status and assignee change in place; the name (or Enter on a row) opens the editor. */
export function WorkList({ onEdit }: { onEdit: (target: EditorTarget) => void }) {
  const board = useBoard();
  const [filters, setFilters] = useState<ListFilters>(NO_FILTERS);
  const [sort, setSort] = useState<ListSort>({ key: 'order', descending: false });
  const rows = useMemo(() => listRows(board, filters, sort), [board, filters, sort]);
  const filter = (changes: Partial<ListFilters>) => setFilters(current => ({ ...current, ...changes }));
  const filtered = Object.values({ ...filters, search: '' }).some(Boolean) || Boolean(filters.search.trim());
  const sprints = [...board.sprints].sort(sprintOrder);
  const cardRef = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(Infinity);

  /* The card's width is measured, as on the timeline (a container query would also hold the */
  /* menus and the editor panel). */
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const observer = new ResizeObserver(() => setWidth(card.clientWidth));
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  function sortBy(key: SortKey) {
    setSort(current => (current.key !== key ? { key, descending: false } : current.descending ? { key: 'order', descending: false } : { key, descending: true }));
  }

  return (
    <section ref={cardRef} className={`work-list-card ${width < NARROW_LIST ? 'is-narrow' : ''} ${width < SLIM_LIST ? 'is-slim' : ''}`} aria-label="List">
      <div className="board-tools">
        <label className="board-search">
          <Icon name="search" size={15} />
          <input aria-label="Search work" placeholder="Search work" value={filters.search} onChange={event => filter({ search: event.target.value })} />
          {filters.search && <button type="button" className="board-search-clear" aria-label="Clear the search" onClick={() => filter({ search: '' })}><Icon name="x" size={13} /></button>}
        </label>
        <Dropdown
          label="Type"
          prefix="Type"
          className={`board-filter ${filters.type ? 'is-active' : ''}`}
          value={filters.type}
          options={[{ value: '', label: 'Any' }, ...(Object.keys(WORK_TYPES) as WorkType[]).map(type => ({ value: type, label: WORK_TYPES[type].label }))]}
          onChange={type => filter({ type })}
        />
        <Dropdown
          label="Status"
          prefix="Status"
          className={`board-filter ${filters.status ? 'is-active' : ''}`}
          value={filters.status}
          options={[{ value: '', label: 'Any' }, ...(Object.keys(WORK_STATUSES) as WorkStatus[]).map(status => ({ value: status, label: WORK_STATUSES[status] }))]}
          onChange={status => filter({ status })}
        />
        <Dropdown
          label="Assignee"
          prefix="Assignee"
          className={`board-filter ${filters.assignee ? 'is-active' : ''}`}
          value={filters.assignee}
          options={[{ value: '', label: 'Anyone' }, { value: NOBODY, label: 'Unassigned' }, ...[...board.members].sort((a, b) => a.localeCompare(b)).map(name => ({ value: name, label: name }))]}
          onChange={assignee => filter({ assignee })}
        />
        <Dropdown
          label="Sprint"
          prefix="Sprint"
          className={`board-filter ${filters.sprint ? 'is-active' : ''}`}
          value={filters.sprint}
          options={[{ value: '', label: 'Any' }, ...sprints.map(sprint => ({ value: sprint.id, label: sprint.name })), { value: BACKLOG, label: 'Backlog' }]}
          onChange={sprint => filter({ sprint })}
        />
        {filtered && <button type="button" className="btn btn-quiet btn-sm" onClick={() => setFilters(NO_FILTERS)}>Clear</button>}
        <span className="board-fill" />
        <span className="board-counts">{filtered ? `${rows.length} of ${board.items.length}` : board.items.length} {board.items.length === 1 ? 'item' : 'items'}</span>
      </div>

      <div className="work-list-body">
        <table className="work-list">
          <thead>
            <tr>
              <th className="work-list-type" scope="col" aria-label="Type" />
              {COLUMNS.map(column => {
                const sorted = sort.key === column.key;
                return (
                  <th key={column.key} className={column.className} scope="col" aria-sort={sorted ? (sort.descending ? 'descending' : 'ascending') : 'none'}>
                    <button type="button" className={`work-list-sort ${sorted ? 'is-sorted' : ''}`} onClick={() => sortBy(column.key)}>
                      {column.label}
                      <Icon name={sorted && sort.descending ? 'arrow-up' : 'arrow-down'} size={12} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(item => {
              const parent = board.items.find(entry => entry.id === item.parentId);
              const sprint = board.sprints.find(entry => entry.id === shownSprintOf(board, item));
              const completion = item.type === 'epic' ? epicCompletion(board.items, item.id) : null;
              return (
                <tr key={item.id}>
                  <td className="work-list-type"><WorkTypeIcon type={item.type} /></td>
                  <td className="work-list-name">
                    <button type="button" className="work-list-open" onClick={() => onEdit({ kind: 'item', id: item.id })}>{item.name}</button>
                    {parent && <small className="work-list-parent">in {parent.name}</small>}
                  </td>
                  <td className="work-list-status">
                    {completion ? <Progress percent={completion.percent} label={completion.total ? `${completion.done} of ${completion.total} tasks done` : 'No tasks yet'} /> : <StatusPicker item={item} />}
                  </td>
                  <td className="work-list-assignee"><span className="work-list-person"><AssigneePicker item={item} board={board} /></span></td>
                  <td className="work-list-sprint">{sprint ? sprint.name : <span className="work-list-muted">Backlog</span>}</td>
                  <td className="work-list-start">{shortDay(item.start)}</td>
                  <td className="work-list-end">{shortDay(item.end)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!board.items.length && (
          <div className="work-list-empty">
            <Icon name="list" size={28} />
            <h3>No work yet.</h3>
            <p>Work you add shows here as a list, and on the timeline.</p>
            <button type="button" className="btn btn-primary" onClick={() => onEdit({ kind: 'item', type: 'task' })}><Icon name="plus" size={16} /> Add a task</button>
          </div>
        )}
        {board.items.length > 0 && !rows.length && <p className="work-list-none">No work matches these filters.</p>}
      </div>
    </section>
  );
}
