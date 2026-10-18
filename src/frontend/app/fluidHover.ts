/* =========================
   Gliding Hover Highlight
   ========================= */

/* Lists whose hover highlight glides from item to item instead of each item lighting up on its */
/* own: one highlight per list follows the pointer, and stays on the nearest item across the */
/* small gaps between items. Dropdowns and the "/" menu are left out, since their highlight also */
/* follows the arrow keys. */
const AREAS: { container: string; item: string }[] = [
  { container: '.page-menu:not(.dropdown-menu)', item: '.page-menu-item' },
  { container: '.settings-nav', item: '.settings-nav-item' },
  { container: '.sidebar-lists', item: '.sidebar-link' },
  { container: '.sidebar-icons', item: '.sidebar-icon' }
];

/* How far outside an item (in pixels) the pointer may be for the item to stay lit. */
const GAP = 8;

const highlights = new WeakMap<Element, HTMLElement>();
let shownIn: Element | null = null;
let frame: number | null = null;

/* The innermost list under the pointer, with the selector of its items. */
function areaAt(target: Element) {
  let found: { container: Element; item: string } | null = null;
  AREAS.forEach(area => {
    const container = target.closest(area.container);
    if (container && (!found || found.container.contains(container))) found = { container, item: area.item };
  });
  return found as { container: Element; item: string } | null;
}

/* The item the pointer is in, or the nearest one within the gap (skipping disabled items and */
/* items of lists inside this one). */
function itemAt(container: Element, selector: string, x: number, y: number) {
  let best: Element | null = null;
  let bestDistance = GAP;
  container.querySelectorAll(selector).forEach(item => {
    if (item.matches(':disabled, [aria-disabled="true"]') || areaAt(item)?.container !== container) return;
    const box = item.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const distance = Math.hypot(Math.max(box.left - x, 0, x - box.right), Math.max(box.top - y, 0, y - box.bottom));
    if (distance <= bestDistance) {
      best = item;
      bestDistance = distance;
    }
  });
  return best as Element | null;
}

/* The list's highlight, added as its first child the first time it is needed. */
function highlightOf(container: Element) {
  let highlight = highlights.get(container);
  if (!highlight?.isConnected) {
    highlight = document.createElement('div');
    highlight.className = 'fluid-highlight';
    highlight.setAttribute('aria-hidden', 'true');
    container.prepend(highlight);
    highlights.set(container, highlight);
  }
  return highlight;
}

/* Put the highlight over an item. A highlight that was hidden appears there without travelling */
/* from where it was last, and fades in. */
function showOn(container: Element, item: Element) {
  const highlight = highlightOf(container);
  const outer = container.getBoundingClientRect();
  const box = item.getBoundingClientRect();
  const x = box.left - outer.left - container.clientLeft + container.scrollLeft;
  const y = box.top - outer.top - container.clientTop + container.scrollTop;
  const appearing = !highlight.classList.contains('is-shown');
  if (appearing) highlight.classList.add('is-placing');
  highlight.style.transform = `translate(${x}px, ${y}px)`;
  highlight.style.width = `${box.width}px`;
  highlight.style.height = `${box.height}px`;
  highlight.style.borderRadius = getComputedStyle(item).borderRadius;
  if (appearing) {
    void highlight.offsetWidth;
    highlight.classList.remove('is-placing');
    highlight.classList.add('is-shown');
  }
}

function hide(container: Element | null) {
  if (container) highlights.get(container)?.classList.remove('is-shown');
}

function update(target: Element | null, x: number, y: number) {
  const area = target ? areaAt(target) : null;
  const item = area ? itemAt(area.container, area.item, x, y) : null;
  if (shownIn && shownIn !== area?.container) hide(shownIn);
  if (area && item) {
    showOn(area.container, item);
    shownIn = area.container;
  } else {
    hide(area?.container ?? null);
    shownIn = null;
  }
}

/* Follow the mouse (and a pen hovering) once per frame. Fingers have no hover, so touch is left */
/* alone. Leaving the window hides the highlight. */
export function startFluidHover() {
  document.documentElement.setAttribute('data-fluid-hover', '');
  document.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return;
    const target = event.target instanceof Element ? event.target : null;
    const { clientX, clientY } = event;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = null;
      update(target, clientX, clientY);
    });
  }, { passive: true });
  const leave = () => {
    hide(shownIn);
    shownIn = null;
  };
  document.documentElement.addEventListener('pointerleave', leave);
  window.addEventListener('blur', leave);
}
