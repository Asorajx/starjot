import type { BoardProject, WorkItem, WorkStatus } from '../../../shared/types/board';
import { today } from '../dates';
import { listRows, NO_FILTERS, type ListFilters } from '../list/listRows';
import { WORK_STATUSES } from '../workItems';


/* =========================
   Board Columns
   ========================= */

/* What the board shows: words to find, an assignee and a sprint, as in the list's filters. */
export type BoardFilters = Pick<ListFilters, 'search' | 'assignee' | 'sprint'>;

export type BoardColumn = { status: WorkStatus; items: WorkItem[] };

/* The board's columns, one per status in WORK_STATUSES's order, each holding its features and */
/* tasks in the project's order. Epics are left out: they have no status of their own (their */
/* progress comes from their tasks), as on Jira's board. */
export function boardColumns(project: BoardProject, filters: BoardFilters): BoardColumn[] {
  const shown = listRows(project, { ...NO_FILTERS, ...filters }, { key: 'order', descending: false }).filter(item => item.type !== 'epic');
  return (Object.keys(WORK_STATUSES) as WorkStatus[]).map(status => ({ status, items: shown.filter(item => item.status === status) }));
}

/* The sprint the board opens on, like Jira's active sprint: the one today falls in (the first by */
/* order when sprints overlap), or none, which shows every sprint. */
export function currentSprint(project: BoardProject, day = today()) {
  return [...project.sprints].sort((a, b) => a.order - b.order).find(sprint => sprint.start <= day && day <= sprint.end)?.id ?? '';
}

/* Whether a work item is past its due date and not done. */
export function isOverdue(item: WorkItem, day = today()) {
  return item.status !== 'done' && Boolean(item.end) && item.end < day;
}
