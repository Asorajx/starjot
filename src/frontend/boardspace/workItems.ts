import type { BoardProject, Sprint, WorkItem, WorkStatus, WorkType } from '../../shared/types/board';


/* =========================
   Kinds and Statuses
   ========================= */

export const WORK_TYPES: Record<WorkType, { label: string; hint: string }> = {
  epic: { label: 'Epic', hint: 'Group features' },
  feature: { label: 'Feature', hint: 'Group tasks' },
  task: { label: 'Task', hint: 'Work to complete' }
};

export const WORK_STATUSES: Record<WorkStatus, string> = {
  todo: 'To do',
  progress: 'In progress',
  review: 'In review',
  done: 'Done',
  blocked: 'Blocked'
};

/* The colours offered for work items' bars; the first is the default. Each is dark enough for */
/* the bar's white name to pass 4.5:1. */
export const BAR_COLORS = ['#2c6af5', '#1d4ea8', '#128091', '#20826e', '#7a5ee4', '#ab6322', '#d13b68', '#536780'];

/* The earlier, lighter colours, each moved to the colour that replaced it when a project loads. */
export const OLD_BAR_COLORS: Record<string, string> = {
  '#4e82f7': '#2c6af5',
  '#2466d9': '#1d4ea8',
  '#17a0b5': '#128091',
  '#28a58c': '#20826e',
  '#8a72e7': '#7a5ee4',
  '#db8e48': '#ab6322',
  '#db6488': '#d13b68'
};

/* The section of the timeline for work in no sprint. */
export const BACKLOG = '__backlog__';

/* Epics hold features, features hold tasks, and tasks can hold sub-tasks. */
export function canHoldWork(parentType: WorkType, type: WorkType) {
  return (type === 'feature' && parentType === 'epic') || type === 'task';
}

/* The kind of work added inside an item by default. */
export function childType(parent: WorkItem): WorkType {
  return parent.type === 'epic' ? 'feature' : 'task';
}

/* A team member's initials, for their avatar. */
export function initialsOf(name: string) {
  return name.split(/\s+/).slice(0, 2).map(part => part[0] ?? '').join('').toUpperCase();
}


/* =========================
   The Tree of Work
   ========================= */

/* The ids of an item and everything inside it, however deep. */
export function familyOf(items: WorkItem[], id: string) {
  const found = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const item of items) {
      if (found.has(item.parentId) && !found.has(item.id)) {
        found.add(item.id);
        grew = true;
      }
    }
  }
  return found;
}

/* An epic's progress: how many of the tasks inside it (at any depth) are done. */
export function epicCompletion(items: WorkItem[], id: string) {
  const family = familyOf(items, id);
  const tasks = items.filter(item => item.type === 'task' && item.id !== id && family.has(item.id));
  const done = tasks.filter(item => item.status === 'done').length;
  return { done, total: tasks.length, percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
}

/* The sprint an item is shown in. An epic with no sprint of its own is shown with the sprint */
/* most of its children are in, so the tree stays together (unless it was moved to the backlog */
/* on purpose). */
export function shownSprintOf(project: BoardProject, item: WorkItem | undefined): string {
  if (!item) return '';
  if (item.sprintId || item.type !== 'epic' || item.manualBacklog) return item.sprintId;
  const family = familyOf(project.items, item.id);
  const counts = new Map<string, number>();
  for (const child of project.items) {
    if (child.id === item.id || !family.has(child.id) || !child.sprintId) continue;
    counts.set(child.sprintId, (counts.get(child.sprintId) ?? 0) + 1);
  }
  const best = project.sprints
    .filter(sprint => counts.has(sprint.id))
    .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.order - b.order)[0];
  return best?.id ?? '';
}

export function sprintOrder(a: Sprint, b: Sprint) {
  return a.order - b.order || a.start.localeCompare(b.start) || a.name.localeCompare(b.name);
}

export function itemOrder(a: WorkItem, b: WorkItem) {
  return a.order - b.order || a.name.localeCompare(b.name);
}

/* A sprint's progress: how many of the tasks shown in it are done. */
export function sprintCompletion(project: BoardProject, sprintId: string) {
  const tasks = project.items.filter(item => item.type === 'task' && shownSprintOf(project, item) === sprintId);
  const done = tasks.filter(item => item.status === 'done').length;
  return { done, total: tasks.length, percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
}


/* =========================
   Timeline Rows
   ========================= */

export type SprintRow = { kind: 'sprint'; id: string; sprint: Sprint | null; count: number };
export type ItemRow = { kind: 'item'; item: WorkItem; depth: number; children: number };
export type TimelineRow = SprintRow | ItemRow;

/* How deep the timeline draws nested work; anything deeper is left out. */
const MAX_DEPTH = 12;

/* The rows of the timeline: each sprint (in order, then the backlog when it holds anything), */
/* followed by its work as a tree. Folded sprints and items hide what is inside them. A search */
/* keeps the items whose name or assignee matches, with the items they sit inside, and ignores */
/* folding so every match shows. */
export function timelineRows(project: BoardProject, search = ''): TimelineRow[] {
  const words = search.trim().toLowerCase();
  const sections: { id: string; sprint: Sprint | null }[] = [...project.sprints].sort(sprintOrder).map(sprint => ({ id: sprint.id, sprint }));
  if (project.items.some(item => !shownSprintOf(project, item))) sections.push({ id: BACKLOG, sprint: null });

  const rows: TimelineRow[] = [];
  for (const section of sections) {
    const sprintId = section.sprint ? section.sprint.id : '';
    const set = project.items.filter(item => shownSprintOf(project, item) === sprintId);
    const byId = new Map(set.map(item => [item.id, item]));
    const matched = new Set<string>();
    if (words) {
      set.filter(item => item.name.toLowerCase().includes(words) || item.assignee.toLowerCase().includes(words)).forEach(item => {
        let current: WorkItem | undefined = item;
        while (current && !matched.has(current.id)) {
          matched.add(current.id);
          current = byId.get(current.parentId);
        }
      });
      const name = section.sprint?.name ?? 'Backlog';
      if (!matched.size && !name.toLowerCase().includes(words)) continue;
    }
    rows.push({ kind: 'sprint', id: section.id, sprint: section.sprint, count: set.length });
    if (project.collapsedSprints[section.id] && !words) continue;

    const drawn = new Set<string>();
    const walk = (item: WorkItem, depth: number) => {
      if (drawn.has(item.id) || depth > MAX_DEPTH || (words && !matched.has(item.id))) return;
      drawn.add(item.id);
      const children = set.filter(child => child.parentId === item.id).sort(itemOrder);
      rows.push({ kind: 'item', item, depth, children: children.length });
      if (!project.collapsedItems[item.id] || words) children.forEach(child => walk(child, depth + 1));
    };
    set.filter(item => !byId.has(item.parentId)).sort(itemOrder).forEach(item => walk(item, 0));
  }
  return rows;
}
