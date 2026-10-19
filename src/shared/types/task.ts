/* =========================
   Work Item Types
   ========================= */

/* Work items remain separate from Notespace notes. */
export type Priority = 'High' | 'Medium' | 'Low';
export type StatusTab = 'todo' | 'progress' | 'review' | 'done';
export type BoardTab = StatusTab | 'list' | 'timeline';

export type Task = {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  tags: string[];
  assignee: string;
  person: string;
  date: string;
  linked: string[];
};
