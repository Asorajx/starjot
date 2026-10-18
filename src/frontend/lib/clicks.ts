/* =========================
   Clicks
   ========================= */

/* Ctrl + click (Cmd + click on a Mac) opens a page in a new tab, as in a browser. */
export function opensNewTab(event: { ctrlKey: boolean; metaKey: boolean }) {
  return event.ctrlKey || event.metaKey;
}

/* Opens a note or category by id. The flag is true for Ctrl + click, which opens it the other */
/* way from Settings → Notes → Open notes in (a new tab, unless notes already open in one). */
export type OpenById = (id: string, inNewTab?: boolean) => void;


/* =========================
   Dragging Notes
   ========================= */

/* A note dragged from the sidebar or a list carries its id under this type; dropped on the tab */
/* bar, it opens in a new tab there. Other drags (text, files, tabs) are left alone. */
export const NOTE_DRAG_TYPE = 'application/x-starjot-note';

export function startNoteDrag(event: { dataTransfer: DataTransfer }, noteId: string) {
  event.dataTransfer.setData(NOTE_DRAG_TYPE, noteId);
  event.dataTransfer.effectAllowed = 'copy';
}
