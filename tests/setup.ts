/* =========================
   Test Setup
   ========================= */

/* Runs before every test file. jsdom, the simulated browser used by the tests, does not lay out */
/* or scroll pages, so scrolling an element into view is replaced with a function that does nothing. */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
