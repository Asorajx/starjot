/* =========================
   Zoomed Elements
   ========================= */

/* An element's place on screen and how much it is zoomed. Notes can be zoomed (the CSS zoom */
/* property), so a distance on screen is divided by the scale to get pixels at 100% zoom. */
export function zoomed(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return { rect, scale: rect.width / (element.offsetWidth || rect.width) || 1 };
}
