import type { BoardProject, WorkItem, WorkStatus, WorkType } from '../../../shared/types/board';
import { BACKLOG, shownSprintOf, sprintOrder, timelineRows, WORK_STATUSES } from '../workItems';


/* =========================
   List Rows
   ========================= */

/* What the list shows: words to find (in names and assignees) and one choice per filter, where */
/* an empty string means "any". Assignee NOBODY means unassigned work; sprint BACKLOG means work */
/* in no sprint. */
export type ListFilters = { search: string; type: WorkType | ''; status: WorkStatus | ''; assignee: string; sprint: string };

export const NO_FILTERS: ListFilters = { search: '', type: '', status: '', assignee: '', sprint: '' };
export const NOBODY = '__nobody__';

/* The column the list is sorted by. "order" is the project's own order: sprint by sprint, each */
/* sprint's work as a tree (as on the timeline, ignoring folding). */
export type SortKey = 'order' | 'name' | 'status' | 'assignee' | 'sprint' | 'start' | 'end';
export type ListSort = { key: SortKey; descending: boolean };

const STATUS_ORDER = Object.keys(WORK_STATUSES) as WorkStatus[];

/* The work the list shows, filtered and sorted. Ties keep the project's own order. */
export function listRows(project: BoardProject, filters: ListFilters, sort: ListSort): WorkItem[] {
  const unfolded = { ...project, collapsedSprints: {}, collapsedItems: {} };
  const order = new Map<string, number>();
  timelineRows(unfolded).forEach((row, index) => {
    if (row.kind === 'item') order.set(row.item.id, index);
  });
  const sprints = [...project.sprints].sort(sprintOrder);
  const sprintPlace = (item: WorkItem) => {
    const place = sprints.findIndex(sprint => sprint.id === shownSprintOf(project, item));
    return place < 0 ? sprints.length : place;
  };

  const words = filters.search.trim().toLowerCase();
  const shown = project.items.filter(item => {
    if (words && !item.name.toLowerCase().includes(words) && !item.assignee.toLowerCase().includes(words)) return false;
    if (filters.type && item.type !== filters.type) return false;
    if (filters.status && (item.type === 'epic' || item.status !== filters.status)) return false;
    if (filters.assignee && (filters.assignee === NOBODY ? item.assignee : item.assignee !== filters.assignee)) return false;
    if (filters.sprint && shownSprintOf(project, item) !== (filters.sprint === BACKLOG ? '' : filters.sprint)) return false;
    return true;
  });

  /* Unassigned work sorts after everyone; an epic (which has no status of its own) after every status. */
  const compare: Record<SortKey, (a: WorkItem, b: WorkItem) => number> = {
    order: () => 0,
    name: (a, b) => a.name.localeCompare(b.name),
    status: (a, b) => (a.type === 'epic' ? STATUS_ORDER.length : STATUS_ORDER.indexOf(a.status)) - (b.type === 'epic' ? STATUS_ORDER.length : STATUS_ORDER.indexOf(b.status)),
    assignee: (a, b) => (a.assignee ? 0 : 1) - (b.assignee ? 0 : 1) || a.assignee.localeCompare(b.assignee),
    sprint: (a, b) => sprintPlace(a) - sprintPlace(b),
    start: (a, b) => a.start.localeCompare(b.start),
    end: (a, b) => a.end.localeCompare(b.end)
  };
  const direction = sort.descending ? -1 : 1;
  return shown.sort((a, b) => direction * compare[sort.key](a, b) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}
