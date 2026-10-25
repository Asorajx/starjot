import { isTypeaheadKey, nextByLetter } from '../lib/typeahead';


/* =========================
   Menu Keys
   ========================= */

/* The keyboard for every menu (role="menu"), like the dropdown menus of desktop apps: ↓ and ↑ */
/* move to the next or previous item (round from the end to the start), Home and End to the */
/* first and last, and typing a letter jumps to the next item starting with it. Menus with keys */
/* of their own (which call preventDefault) are left alone. */
const ITEMS = '[role="menuitem"]:not(:disabled):not([aria-disabled="true"]), [role="menuitemradio"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled)';

function itemsIn(menu: Element) {
  return [...menu.querySelectorAll<HTMLElement>(ITEMS)].filter(item => item.closest('[role="menu"]') === menu && item.offsetParent !== null);
}

export function startMenuKeys() {
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const menu = target?.closest('[role="menu"]');
    if (!target || !menu || target.matches('input, textarea, [contenteditable="true"]')) return;
    const items = itemsIn(menu);
    if (!items.length) return;
    const at = items.indexOf(target.closest<HTMLElement>(ITEMS) as HTMLElement);

    let next = -1;
    if (event.key === 'ArrowDown') next = (at + 1) % items.length;
    else if (event.key === 'ArrowUp') next = at <= 0 ? items.length - 1 : at - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else if (isTypeaheadKey(event)) next = nextByLetter(items.map(item => item.textContent ?? ''), at, event.key);
    if (next < 0) return;
    event.preventDefault();
    items[next].focus();
  });
}
