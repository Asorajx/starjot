/* =========================
   Boardspace Work Items
   ========================= */

/* Shared by the frontend (Boardspace's summary, list, board and timeline) and the backend */
/* (storage). The shape matches the saved data of the earlier Gantt timeline, so its projects */
/* still load. */

/* Epics hold features, features hold tasks, and tasks can hold sub-tasks. */
export type WorkType = 'epic' | 'feature' | 'task';
export type WorkStatus = 'todo' | 'progress' | 'review' | 'done' | 'blocked';

/* A planning period. Dates are days written as YYYY-MM-DD. */
export type Sprint = {
  id: string;
  name: string;
  start: string;
  end: string;
  order: number;
};

export type WorkItem = {
  id: string;
  name: string;
  type: WorkType;

  /* The id of the item it sits inside, or an empty string. */
  parentId: string;

  /* The id of its sprint, or an empty string for the backlog. */
  sprintId: string;
  status: WorkStatus;

  /* A team member's name, or an empty string when unassigned. */
  assignee: string;
  start: string;
  end: string;

  /* The colour of its bar on the timeline, as #rrggbb. */
  color: string;

  /* How far along a feature or task is, 0 to 100 (an epic's comes from its tasks instead). */
  progress: number;

  /* An epic moved to the backlog on purpose stays there, even when its children are in sprints. */
  manualBacklog: boolean;
  order: number;
};

export type BoardProject = {
  version: 5;
  title: string;

  /* The names offered when assigning work. */
  members: string[];
  sprints: Sprint[];
  items: WorkItem[];

  /* Sprints and items folded on the timeline, by id. */
  collapsedSprints: Record<string, true>;
  collapsedItems: Record<string, true>;
};
