/* =========================
   Warm Tooltips
   ========================= */

/* The first tooltip waits a moment (so passing over a button shows nothing), but once one has */
/* shown, the next appears straight away while the pointer moves from button to button. The app */
/* stays "warm" until the pointer has been off every tooltip for a short while. The tooltips */
/* themselves are CSS (styles.css); this only sets data-tooltips-warm on the page. */

/* How long the pointer rests on a button before its tooltip shows (matches styles.css). */
const WARM_UP = 400;

/* How long the page stays warm after the pointer leaves the last tooltip. */
const COOL_DOWN = 600;

let warmTimer: number | undefined;
let coolTimer: number | undefined;

function tooltipOf(target: EventTarget | null) {
  return target instanceof Element ? target.closest('[data-tooltip]') : null;
}

function setWarm(warm: boolean) {
  document.documentElement.toggleAttribute('data-tooltips-warm', warm);
}

/* Mouse and pen only: fingers have no hover, so touch is left alone. A click or a key cools the */
/* page, so a tooltip never pops up instantly while the person is busy with something else. */
export function startWarmTooltips() {
  document.addEventListener('pointerover', event => {
    if (event.pointerType === 'touch' || !tooltipOf(event.target)) return;
    window.clearTimeout(coolTimer);
    if (document.documentElement.hasAttribute('data-tooltips-warm')) return;
    window.clearTimeout(warmTimer);
    warmTimer = window.setTimeout(() => setWarm(true), WARM_UP);
  }, { passive: true });

  document.addEventListener('pointerout', event => {
    if (event.pointerType === 'touch' || !tooltipOf(event.target) || tooltipOf(event.relatedTarget)) return;
    window.clearTimeout(warmTimer);
    window.clearTimeout(coolTimer);
    coolTimer = window.setTimeout(() => setWarm(false), COOL_DOWN);
  }, { passive: true });

  const cool = () => {
    window.clearTimeout(warmTimer);
    window.clearTimeout(coolTimer);
    setWarm(false);
  };
  document.addEventListener('pointerdown', cool, { passive: true });
  document.addEventListener('keydown', cool);
  window.addEventListener('blur', cool);
}
