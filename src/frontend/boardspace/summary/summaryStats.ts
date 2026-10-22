import type { BoardProject, Sprint, WorkItem, WorkStatus } from '../../../shared/types/board';
import { addDays, isoDay, parseDay, today } from '../dates';
import { isOverdue } from '../board/boardColumns';
import { epicCompletion, itemOrder, sprintCompletion, sprintOrder, WORK_STATUSES } from '../workItems';

/* How many days ahead "due soon" looks. */
export const DUE_SOON_DAYS = 7;


/* =========================
   Summary Numbers
   ========================= */

export type Completion = { done: number; total: number; percent: number };

export type ProjectSummary = {
  /* Features and tasks (epics have no status of their own). */
  total: number;
  byStatus: { status: WorkStatus; count: number }[];

  /* Tasks done out of all tasks, as epics and sprints count progress. */
  tasks: Completion;
  overdue: WorkItem[];
  dueSoon: WorkItem[];
  sprints: { sprint: Sprint; completion: Completion; current: boolean }[];
  epics: { epic: WorkItem; completion: Completion }[];

  /* Open (not done) and done work per member, then unassigned work (name ''); busiest first. */
  people: { name: string; open: number; done: number }[];
};

/* Everything the Summary shows, worked out from the project as it is on a given day. */
export function projectSummary(project: BoardProject, day = today()): ProjectSummary {
  const work = project.items.filter(item => item.type !== 'epic');
  const tasks = work.filter(item => item.type === 'task');
  const doneTasks = tasks.filter(item => item.status === 'done').length;
  const soonEnd = isoDay(addDays(parseDay(day) ?? new Date(), DUE_SOON_DAYS));
  const byDue = (a: WorkItem, b: WorkItem) => a.end.localeCompare(b.end) || itemOrder(a, b);

  const names = [...project.members];
  for (const item of work) if (item.assignee && !names.includes(item.assignee)) names.push(item.assignee);
  const people = [...names, ''].map(name => {
    const theirs = work.filter(item => item.assignee === name);
    return { name, open: theirs.filter(item => item.status !== 'done').length, done: theirs.filter(item => item.status === 'done').length };
  }).filter(person => person.name || person.open || person.done);

  return {
    total: work.length,
    byStatus: (Object.keys(WORK_STATUSES) as WorkStatus[]).map(status => ({ status, count: work.filter(item => item.status === status).length })),
    tasks: { done: doneTasks, total: tasks.length, percent: tasks.length ? Math.round((doneTasks / tasks.length) * 100) : 0 },
    overdue: work.filter(item => isOverdue(item, day)).sort(byDue),
    dueSoon: work.filter(item => item.status !== 'done' && item.end >= day && item.end <= soonEnd).sort(byDue),
    sprints: [...project.sprints].sort(sprintOrder).map(sprint => ({ sprint, completion: sprintCompletion(project, sprint.id), current: sprint.start <= day && day <= sprint.end })),
    epics: project.items.filter(item => item.type === 'epic').sort(itemOrder).map(epic => ({ epic, completion: epicCompletion(project.items, epic.id) })),
    people: people.sort((a, b) => Number(!a.name) - Number(!b.name) || b.open - a.open || a.name.localeCompare(b.name))
  };
}
