import type { BoardTab, StatusTab } from '../../shared/types/task';


/* =========================
   Boardspace Views
   ========================= */

export const BOARD_TABS: { id: BoardTab; label: string }[] = [
  { id: 'todo', label: 'To do' },
  { id: 'progress', label: 'In progress' },
  { id: 'review', label: 'In review' },
  { id: 'done', label: 'Done' },
  { id: 'list', label: 'List' },
  { id: 'timeline', label: 'Timeline' }
];

/* The short description shown under each status heading. */
export const TAB_DESCRIPTIONS: Record<StatusTab, string> = {
  todo: 'Everything lined up and ready for the next move.',
  progress: 'What the team is focusing on right now.',
  review: 'Work waiting for feedback and final approval.',
  done: 'A little proof of progress, one completed item at a time.'
};
