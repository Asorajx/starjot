/* =========================
   Keyboard Mark
   ========================= */

/* Marks the page with data-keyboard while the keyboard is moving around (Tab), until the mouse */
/* or a finger is used again. Focus marks that would get in the way after a click (the edge on */
/* the note's text, see editor.css) only show then. */
export function startKeyboardMark() {
  const root = document.documentElement;
  document.addEventListener('keydown', event => {
    if (event.key === 'Tab' && !event.defaultPrevented) root.setAttribute('data-keyboard', '');
  });
  document.addEventListener('pointerdown', () => root.removeAttribute('data-keyboard'), { capture: true, passive: true });
}
