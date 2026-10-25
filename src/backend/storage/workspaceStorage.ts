/* =========================
   Workspace Storage
   ========================= */

/* The window's tabs, splits and stacks, the space shown and Boardspace's view, saved in this */
/* browser so Starjot can open where it was left. Only places are kept (which note, category or */
/* home each tab shows), never note content. The frontend checks the data (app/noteTabs.ts). */
const STORAGE_KEY = 'starjot-workspace-v1';

/* The saved layout as parsed JSON, or null when none is saved or it cannot be read (a layout */
/* is easy to lose: Starjot then simply opens as on a first visit). */
export function readWorkspace(): unknown {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

/* Saving can fail (for example in private browsing); the layout then lasts for this visit only. */
export function writeWorkspace(saved: object) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    /* Nothing else to do: the next open starts on the Start screen. */
  }
}
