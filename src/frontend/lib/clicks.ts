/* =========================
   Clicks
   ========================= */

/* Ctrl + click (Cmd + click on a Mac) opens a page in a new tab, as in a browser. */
export function opensNewTab(event: { ctrlKey: boolean; metaKey: boolean }) {
  return event.ctrlKey || event.metaKey;
}

/* Opens a note or category by id: here, or in a new tab when inNewTab is true. */
export type OpenById = (id: string, inNewTab?: boolean) => void;
