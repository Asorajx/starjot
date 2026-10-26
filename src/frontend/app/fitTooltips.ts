/* =========================
   Fitting Tooltips
   ========================= */

/* Tooltips are CSS (styles.css), placed below their button, centred or lined up with one of its */
/* edges. Near the side or the bottom of the window (on a phone, almost always) that could run off */
/* the screen, so just before one shows, this measures it and moves it back inside: sideways */
/* (--tooltip-shift), wrapped onto more lines when it is wider than the window */
/* (data-tooltip-squeeze), or above or below its button instead (data-tooltip-fit). */

/* The space kept between a tooltip and the edge of the window. */
const MARGIN = 8;

/* The gap between a tooltip and its button (matches styles.css). */
const GAP = 4;

/* The widest a wrapping tooltip's text gets (matches data-tooltip-wrap in styles.css), and the */
/* padding on each side of the text. */
const WRAP_WIDTH = 240;
const PADDING = 8;

let measure: HTMLSpanElement | null = null;

/* An invisible copy of a tooltip, to measure how big it would be (padding included). maxWidth is */
/* the widest its text may get. */
function sizeOf(text: string, maxWidth: number | null) {
  if (!measure) {
    measure = document.createElement('span');
    measure.className = 'tooltip-measure';
    measure.setAttribute('aria-hidden', 'true');
    document.body.append(measure);
  }
  measure.textContent = text;
  measure.style.whiteSpace = maxWidth ? 'normal' : 'nowrap';
  measure.style.maxWidth = maxWidth ? `${maxWidth}px` : 'none';
  return { width: measure.offsetWidth, height: measure.offsetHeight };
}

function textOf(element: HTMLElement) {
  const shortcut = element.dataset.shortcut && document.documentElement.dataset.tips !== 'off' ? ` (${element.dataset.shortcut})` : '';
  return `${element.dataset.tooltip ?? ''}${shortcut}`;
}

export function fitTooltip(element: HTMLElement) {
  delete element.dataset.tooltipFit;
  delete element.dataset.tooltipSqueeze;
  element.style.removeProperty('--tooltip-shift');

  /* A button left in place by its container (see .option-grid.is-icons) is placed by it. */
  if (!element.dataset.tooltip || getComputedStyle(element).position === 'static') return;

  const room = window.innerWidth - MARGIN * 2;
  let size = sizeOf(textOf(element), element.hasAttribute('data-tooltip-wrap') ? WRAP_WIDTH : null);
  if (size.width > room) {
    element.dataset.tooltipSqueeze = '';
    size = sizeOf(textOf(element), room - PADDING * 2);
  }

  const box = element.getBoundingClientRect();
  let side = element.dataset.tooltipSide ?? 'below';
  let align = element.dataset.tooltipAlign ?? 'center';

  /* A label to the left with no room there goes below instead. */
  if (side === 'left' && box.left - GAP * 2 - size.width < MARGIN) {
    element.dataset.tooltipFit = 'below';
    side = 'below';
    align = 'center';
  }
  if (side === 'left') return;

  if (side === 'below' && box.bottom + GAP + size.height > window.innerHeight - MARGIN && box.top - GAP - size.height >= MARGIN) {
    element.dataset.tooltipFit = 'above';
  } else if (side === 'above' && box.top - GAP - size.height < MARGIN) {
    element.dataset.tooltipFit = element.dataset.tooltipFit ?? 'below';
  }

  const left = align === 'start' ? box.left : align === 'end' ? box.right - size.width : box.left + box.width / 2 - size.width / 2;
  let shift = 0;
  if (left < MARGIN) shift = MARGIN - left;
  else if (left + size.width > window.innerWidth - MARGIN) shift = window.innerWidth - MARGIN - (left + size.width);
  if (shift) element.style.setProperty('--tooltip-shift', `${Math.round(shift)}px`);
}

/* Fit each tooltip as the pointer (or a finger, whose tap can leave one showing) reaches its */
/* button, or as the keyboard focuses it. */
export function startFittingTooltips() {
  const fit = (event: Event) => {
    const element = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-tooltip]') : null;
    if (element) fitTooltip(element);
  };
  document.addEventListener('pointerover', fit, { passive: true });
  document.addEventListener('focusin', fit);
}
