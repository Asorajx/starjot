/* =========================
   Zoomed Elements
   ========================= */

/* An element's place on screen and how much it is zoomed. Notes can be zoomed (the CSS zoom */
/* property), so a distance on screen is divided by the scale to get pixels at 100% zoom. */
export function zoomed(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return { rect, scale: rect.width / (element.offsetWidth || rect.width) || 1 };
}


/* =========================
   Visible Area
   ========================= */

/* The part of the screen where something placed over an element can be seen, from top to */
/* bottom: the window, narrowed by every scrolling area the element sits in (which hides whatever */
/* runs past its edges), and below a page bar stuck over the top of that area (a note's page bar, */
/* see PageBar). Used by dropdown menus and the outlines of selected table parts. */
export function visibleArea(element: Element) {
  let top = 0;
  let bottom = window.innerHeight;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (getComputedStyle(parent).overflowY === 'visible') continue;
    const box = parent.getBoundingClientRect();
    const bar = parent.querySelector('.page-bar');
    top = Math.max(top, box.top, bar && getComputedStyle(bar).position === 'sticky' ? bar.getBoundingClientRect().bottom : 0);
    bottom = Math.min(bottom, box.bottom);
  }
  return { top, bottom };
}
