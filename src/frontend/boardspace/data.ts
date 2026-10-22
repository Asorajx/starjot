import type { BoardTab } from '../../shared/types/board';


/* =========================
   Boardspace Views
   ========================= */

export const BOARD_TABS: { id: BoardTab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'list', label: 'List' },
  { id: 'board', label: 'Board' },
  { id: 'timeline', label: 'Timeline' }
];

/* The icon beside each view, in the tabs and the sidebar. */
export const BOARD_ICONS = { summary: 'layout-dashboard', list: 'list', board: 'kanban', timeline: 'calendar-days' } as const;
