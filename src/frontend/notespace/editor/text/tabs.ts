import { escapeHtml } from '../../../lib/html';
import { iconMarkup } from '../../../components/Icon';
import { caretAtEdge, caretElement, closestAtCaret, emptyParagraph, isEmptyContent, placeCaret } from './dom';


/* =========================
   Tab Blocks
   ========================= */

/* A tab block holds any number of named tabs, each with its own lines; one is shown at a time: */
/* <div class="tab-block"><div class="tab-panel is-active" data-title="Setup">…</div>…</div>. */
/* The strip of tab names above the panels is drawn when shown (hydrateTabs) and never saved. */
export const TAB_TITLE_LENGTH = 40;

export function tabPanels(block: Element) {
  return Array.from(block.children).filter((child): child is HTMLElement => child.classList.contains('tab-panel'));
}

/* A tab's name, or "Tab 2" for one without a name. */
export function tabTitle(panel: Element, index: number) {
  return panel.getAttribute('data-title')?.trim() || `Tab ${index + 1}`;
}

function createPanel(title: string) {
  const panel = document.createElement('div');
  panel.className = 'tab-panel';
  panel.dataset.title = title;
  panel.appendChild(emptyParagraph());
  return panel;
}

/* A new tab block starts with two tabs, the first one shown. */
export function createTabBlock() {
  const block = document.createElement('div');
  block.className = 'tab-block';
  block.append(createPanel('Tab 1'), createPanel('Tab 2'));
  block.firstElementChild?.classList.add('is-active');
  hydrateTabs(block);
  return block;
}

/* The markup last drawn into each block's strip, so unchanged strips are not redrawn. */
const drawn = new WeakMap<Element, string>();

/* Draw (or redraw) each tab block's strip: a button per tab, with × to remove it while there is */
/* more than one, and + to add a tab. The strip cannot be typed into. */
export function hydrateTabs(root: Element | null) {
  const blocks = root ? [...(root.matches('.tab-block') ? [root] : []), ...Array.from(root.querySelectorAll('.tab-block'))] : [];
  blocks.forEach(block => {
    const panels = tabPanels(block);
    if (!panels.length) return;
    if (!panels.some(panel => panel.classList.contains('is-active'))) panels[0].classList.add('is-active');
    let strip = block.firstElementChild?.classList.contains('tab-strip') ? block.firstElementChild as HTMLElement : null;
    if (!strip) {
      strip = document.createElement('div');
      strip.className = 'tab-strip';
      strip.setAttribute('contenteditable', 'false');
      block.prepend(strip);
    }
    const removable = panels.length > 1;
    const html = panels.map((panel, index) => {
      const title = escapeHtml(tabTitle(panel, index));
      const active = panel.classList.contains('is-active');
      return `<span class="tab-strip-tab${active ? ' is-active' : ''}" data-tab-index="${index}">`
        + `<button type="button" class="tab-strip-name" role="tab" aria-selected="${active}" title="Double-click to rename">${title}</button>`
        + (removable ? `<button type="button" class="tab-strip-remove" aria-label="Remove ${title}" title="Remove tab">${iconMarkup('x', 12)}</button>` : '')
        + '</span>';
    }).join('') + `<button type="button" class="tab-strip-add" aria-label="Add a tab" title="Add a tab">${iconMarkup('plus', 14)}</button>`;
    if (drawn.get(strip) === html && strip.firstChild) return;
    strip.innerHTML = html;
    drawn.set(strip, html);
  });
}


/* =========================
   Changing Tabs
   ========================= */

/* Show one tab of a block. */
export function activateTab(block: Element, index: number) {
  tabPanels(block).forEach((panel, at) => panel.classList.toggle('is-active', at === index));
  hydrateTabs(block);
}

/* Add a tab after the last one, show it, and return its first line (for the caret). */
export function addTab(block: Element) {
  const panels = tabPanels(block);
  let number = panels.length + 1;
  while (panels.some((panel, index) => tabTitle(panel, index) === `Tab ${number}`)) number += 1;
  const panel = createPanel(`Tab ${number}`);
  (panels[panels.length - 1] ?? block.lastElementChild)?.after(panel);
  activateTab(block, panels.length);
  return panel.firstElementChild as HTMLElement;
}

/* Remove a tab and what it holds; the tab before it (or the next one) is shown instead. A block */
/* keeps at least one tab. */
export function removeTab(block: Element, index: number) {
  const panels = tabPanels(block);
  if (panels.length < 2 || !panels[index]) return;
  const wasActive = panels[index].classList.contains('is-active');
  panels[index].remove();
  if (wasActive) activateTab(block, Math.max(0, index - 1));
  else hydrateTabs(block);
}

/* The tab Backspace would remove: the one holding a collapsed caret on its only, empty line. */
export function emptyTabAtCaret(event: KeyboardEvent) {
  if (event.key !== 'Backspace' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !window.getSelection()?.isCollapsed) return null;
  const inside = lineInPanel();
  if (!inside || inside.panel.childElementCount !== 1 || !isEmptyContent(inside.line)) return null;
  return inside.panel;
}

/* Remove an empty tab, or the whole block when it is the last tab, and return the line for the */
/* caret: the end of the tab shown instead, or the empty line left in the block's place. */
export function removeEmptyTab(panel: HTMLElement) {
  const block = panel.parentElement as HTMLElement;
  if (tabPanels(block).length < 2) return deleteTabBlock(block);
  removeTab(block, tabPanels(block).indexOf(panel));
  const shown = tabPanels(block).find(item => item.classList.contains('is-active'));
  return (shown?.lastElementChild ?? shown) as HTMLElement;
}

/* Remove a whole tab block. An empty line takes its place, for the caret to carry on from. */
export function deleteTabBlock(block: Element) {
  const paragraph = emptyParagraph();
  block.replaceWith(paragraph);
  return paragraph;
}

export function renameTab(block: Element, index: number, title: string) {
  const panel = tabPanels(block)[index];
  if (!panel) return;
  panel.dataset.title = title.trim().slice(0, TAB_TITLE_LENGTH) || `Tab ${index + 1}`;
  hydrateTabs(block);
}

/* Show the tabs holding a node (such as a heading chosen in Contents, or a match of Find), from */
/* the outermost in. Returns true when a hidden tab was shown. */
export function showTabOf(node: Node | null) {
  let changed = false;
  let panel = (node instanceof Element ? node : node?.parentElement)?.closest('.tab-panel') ?? null;
  while (panel) {
    const block = panel.parentElement;
    if (block && !panel.classList.contains('is-active')) {
      activateTab(block, tabPanels(block).indexOf(panel as HTMLElement));
      changed = true;
    }
    panel = block?.parentElement?.closest('.tab-panel') ?? null;
  }
  return changed;
}

/* Whether a range covers all of an element's text. Browsers move a selection's ends into the text */
/* nodes, so the text is compared rather than the boundaries. */
function covers(range: Range, element: Element) {
  const whole = document.createRange();
  whole.selectNodeContents(element);
  if (range.compareBoundaryPoints(Range.START_TO_START, whole) <= 0 && range.compareBoundaryPoints(Range.END_TO_END, whole) >= 0) return true;
  return element.contains(range.commonAncestorContainer) && range.toString() === whole.toString();
}

/* Ctrl + A in a tab: 'tab' when it selected everything in the tab holding the selection, 'note' */
/* when the whole tab was already selected (the whole note should be selected next), or null when */
/* the selection is not in one tab of root, or is in a table cell not yet all selected (the table */
/* selects the cell first). */
export function selectTabText(root: Element | null): 'tab' | 'note' | null {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const panelOf = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest('.tab-panel') ?? null;
  const panel = range ? panelOf(range.startContainer) : null;
  if (!selection || !range || !panel || !root?.contains(panel) || panelOf(range.endContainer) !== panel) return null;
  const cell = closestAtCaret('td, th');
  if (cell && panel.contains(cell) && !covers(range, cell)) return null;
  if (covers(range, panel)) return 'note';
  const whole = document.createRange();
  whole.selectNodeContents(panel);
  selection.removeAllRanges();
  selection.addRange(whole);
  return 'tab';
}

/* Whether typing over or deleting a selection would break a tab block: the selection reaches */
/* into a hidden tab, or runs from one tab into another or out of the block, without covering */
/* the whole block (deleting a whole block is fine, and can be undone). */
export function breaksTabBlock(range: Range, root: Element) {
  if (range.collapsed) return false;
  const panelOf = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest('.tab-panel') ?? null;
  const startPanel = panelOf(range.startContainer);
  const endPanel = panelOf(range.endContainer);
  return Array.from(root.querySelectorAll('.tab-block')).some(block => {
    if (!range.intersectsNode(block)) return false;
    const whole = document.createRange();
    whole.selectNode(block);
    const coversBlock = range.compareBoundaryPoints(Range.START_TO_START, whole) <= 0 && range.compareBoundaryPoints(Range.END_TO_END, whole) >= 0;
    if (coversBlock) return false;
    const hiddenTouched = tabPanels(block).some(panel => !panel.classList.contains('is-active') && range.intersectsNode(panel));
    return hiddenTouched || startPanel !== endPanel;
  });
}

/* The names of the tabs a node sits in, outermost first, for labels such as "Setup › Install". */
export function tabPathOf(node: Element) {
  const names: string[] = [];
  let panel = node.closest('.tab-panel');
  while (panel?.parentElement) {
    names.unshift(tabTitle(panel, tabPanels(panel.parentElement).indexOf(panel as HTMLElement)));
    panel = panel.parentElement.parentElement?.closest('.tab-panel') ?? null;
  }
  return names;
}


/* =========================
   Keys in Tab Blocks
   ========================= */

type TabKeyResult = { kind: 'changed' | 'blocked' } | { kind: 'lines'; focus: HTMLElement; atEnd: boolean };

/* The top-level line holding the caret inside a tab, and that tab. */
function lineInPanel() {
  let line: Element | null = caretElement();
  while (line && !line.parentElement?.classList.contains('tab-panel')) {
    if (line.matches('.block-content, .note-body')) return null;
    line = line.parentElement;
  }
  return line?.parentElement ? { line: line as HTMLElement, panel: line.parentElement } : null;
}

/* Keys that would break a tab block's frame are handled here (Backspace in an empty tab is */
/* removeEmptyTab, which needs an undo step before it): */
/* - Backspace at the start of a tab's first line, or Delete at the end of its last, would merge */
/*   with the strip or another tab, so they do nothing. */
/* - Backspace on an empty last line (not the only one) moves it out, to just below the block. */
/* - Backspace just below a block, or Delete just above it, would pull text into a hidden tab, so */
/*   an empty line there is removed and other lines are left as they are. */
export function tabKeys(event: KeyboardEvent): TabKeyResult | null {
  if ((event.key !== 'Backspace' && event.key !== 'Delete') || event.altKey || event.ctrlKey || event.metaKey) return null;
  if (!window.getSelection()?.isCollapsed) return null;
  const backward = event.key === 'Backspace';
  const inside = lineInPanel();

  if (inside) {
    const { line, panel } = inside;
    const block = panel.parentElement as HTMLElement;
    const first = line === panel.firstElementChild;
    const last = line === panel.lastElementChild;

    if (backward && last && !first && isEmptyContent(line) && line.tagName === 'P') {
      event.preventDefault();
      line.remove();
      const paragraph = emptyParagraph();
      block.after(paragraph);
      return { kind: 'lines', focus: paragraph, atEnd: false };
    }
    if ((backward && first && caretAtEdge(line, 'start')) || (!backward && last && caretAtEdge(line, 'end'))) {
      event.preventDefault();
      return { kind: 'blocked' };
    }
    return null;
  }

  const line = closestAtCaret<HTMLElement>('p, h1, h2, h3, h4, h5, h6');
  if (!line || line.closest('li, td, th, .toggle-summary')) return null;
  const neighbour = backward ? line.previousElementSibling : line.nextElementSibling;
  if (!neighbour?.classList.contains('tab-block') || !caretAtEdge(line, backward ? 'start' : 'end')) return null;
  event.preventDefault();
  if (!isEmptyContent(line)) return { kind: 'blocked' };
  line.remove();
  const panel = tabPanels(neighbour).find(item => item.classList.contains('is-active'));
  const target = backward ? panel?.lastElementChild : panel?.firstElementChild;
  if (target) placeCaret(target, backward);
  return { kind: 'changed' };
}
