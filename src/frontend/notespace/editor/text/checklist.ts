/* =========================
   Checklists
   ========================= */

/* A checklist is a bulleted list with the "checklist" class; a ticked item has "is-checked". */
/* The box is drawn by CSS at the start of each item, inside the item's left padding. */
export function createChecklist() {
  const list = document.createElement('ul');
  list.className = 'checklist';
  list.appendChild(document.createElement('li')).appendChild(document.createElement('br'));
  return list;
}

/* How far into an item, from its left edge, a click counts as a click on its box. */
const BOX_WIDTH = 24;

/* The checklist item whose box was clicked, or null for a click anywhere else (such as on the */
/* item's text, which places the caret as usual). */
export function clickedCheckbox(event: MouseEvent) {
  const item = (event.target as Element | null)?.closest?.<HTMLLIElement>('ul.checklist > li');
  if (!item) return null;
  const left = item.getBoundingClientRect().left;
  return event.clientX >= left && event.clientX < left + BOX_WIDTH ? item : null;
}

export function toggleChecked(item: HTMLLIElement) {
  item.classList.toggle('is-checked');
}
