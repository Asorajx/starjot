/* =========================
   Boardspace
   ========================= */

/* The Boardspace project: sprints, work items and team members. The key is the one the earlier */
/* Gantt timeline used, so a project made there still opens. The frontend checks the data */
/* (boardspace/board.ts). */
const STORAGE_KEY = 'gantt-studio-saas-v1';

export function readBoard(): unknown {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

/* Returns false when saving failed (for example in private browsing). */
export function writeBoard(project: unknown) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    return true;
  } catch {
    return false;
  }
}
