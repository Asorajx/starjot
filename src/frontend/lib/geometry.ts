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


/* =========================
   Edge Scrolling
   ========================= */

/* The fastest an area scrolls while something is dragged at its edge, in pixels a second. */
const EDGE_SCROLL_SPEED = 960;

/* How far to scroll in one frame while something is dragged near the edge of a scrolling area */
/* that runs from low to high on screen: nothing in the middle, then faster the closer the pointer */
/* is to an edge (gently at first), at full speed at the edge or past it. Negative scrolls back. */
/* A long gap between frames (a tab in the background) counts as at most 32 ms, so it never jumps. */
export function edgeScrollStep(pointer: number, low: number, high: number, elapsed: number) {
  if (![pointer, low, high, elapsed].every(Number.isFinite) || high - low < 24) return 0;
  const band = Math.min(72, (high - low) / 3);
  const towardLow = Math.min(1, Math.max(0, (low + band - pointer) / band));
  const towardHigh = Math.min(1, Math.max(0, (pointer - (high - band)) / band));
  return (towardHigh ** 2 - towardLow ** 2) * EDGE_SCROLL_SPEED * Math.min(32, Math.max(0, elapsed)) / 1000;
}
