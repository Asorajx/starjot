import type { BoardTab, ProjectTab, StatusTab } from '../../shared/types/task';


/* =========================
   Boardspace Views
   ========================= */

export const BOARD_TABS: { id: BoardTab; label: string }[] = [
  { id: 'todo', label: 'To do' },
  { id: 'progress', label: 'In progress' },
  { id: 'review', label: 'In review' },
  { id: 'done', label: 'Done' },
  { id: 'summary', label: 'Summary' },
  { id: 'list', label: 'List' },
  { id: 'board', label: 'Board' },
  { id: 'timeline', label: 'Timeline' }
];

export const PROJECT_TABS: ProjectTab[] = ['summary', 'list', 'board', 'timeline'];

export function isProjectTab(tab: BoardTab): tab is ProjectTab {
  return (PROJECT_TABS as BoardTab[]).includes(tab);
}

/* The icon beside each project view, in the tabs and the sidebar. */
export const PROJECT_ICONS = { summary: 'layout-dashboard', list: 'list', board: 'kanban', timeline: 'calendar-days' } as const;

/* The short description shown under each status heading. */
export const TAB_DESCRIPTIONS: Record<StatusTab, string> = {
  todo: 'Everything lined up and ready for the next move.',
  progress: 'What the team is focusing on right now.',
  review: 'Work waiting for feedback and final approval.',
  done: 'A little proof of progress, one completed item at a time.'
};
