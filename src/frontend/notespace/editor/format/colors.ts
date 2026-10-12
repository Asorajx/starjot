/* =========================
   Text Colours
   ========================= */

/* Selected text can have a text colour and a background colour (a highlight), each from a set of */
/* named colours. They are stored as classes, such as <span class="text-red"> or <span */
/* class="bg-yellow">, so the stylesheet decides the actual colours (and dark mode can change them). */
export type ColorKind = 'text' | 'bg';

export const COLOR_NAMES = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const;
export type ColorName = (typeof COLOR_NAMES)[number];

/* A colour choice as stored in the recently used list, such as "text-red" or "bg-blue". */
export type ColorClass = `${ColorKind}-${ColorName}`;

const COLOR_CLASS = new RegExp(`^(text|bg)-(${COLOR_NAMES.join('|')})$`);

export function isColorClass(name: string): name is ColorClass {
  return COLOR_CLASS.test(name);
}

/* The colour class of a kind an element has, if any. */
function colorOf(element: Element, kind: ColorKind) {
  return Array.from(element.classList).find(name => isColorClass(name) && name.startsWith(`${kind}-`)) ?? null;
}

/* The colours of a kind used at the start of a range (to show which swatch is chosen). */
export function colorAt(range: Range, kind: ColorKind) {
  let element: Element | null = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  while (element && !element.hasAttribute('data-note-editable')) {
    const found = colorOf(element, kind);
    if (found) return found;
    element = element.parentElement;
  }
  return null;
}

/* The pieces of note text a range covers, with the text at either end split off where the */
/* range starts and ends. Text inside page cards, images and other fixed parts is left out. */
function selectedText(range: Range) {
  const root = range.commonAncestorContainer;
  const walker = document.createTreeWalker(root instanceof Element ? root : root.parentElement ?? document.body, NodeFilter.SHOW_TEXT);
  const found: Text[] = [];
  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    const parent = text.parentElement;
    if (!range.intersectsNode(text) || !text.length || !parent?.closest('[data-note-editable]') || parent.closest('[contenteditable="false"]')) continue;
    found.push(text);
  }
  if (!found.length && root.nodeType === Node.TEXT_NODE) found.push(root as Text);

  const { startContainer, startOffset, endContainer, endOffset } = range;
  return found.flatMap(original => {
    let text = original;
    if (text === endContainer && endOffset < text.length) text.splitText(endOffset);
    if (text === startContainer && startOffset > 0) text = text.splitText(startOffset);
    return text.length ? [text] : [];
  });
}

function wrap(node: Node, className: string) {
  const span = document.createElement('span');
  span.className = className;
  node.parentNode?.insertBefore(span, node);
  span.appendChild(node);
  return span;
}

/* Join neighbouring colour spans of the same colour and remove empty ones, so recolouring the */
/* same words again and again does not pile up spans. */
function tidy(root: Element) {
  root.querySelectorAll('span').forEach(span => {
    if (!span.isConnected || !isColorClass(span.className)) return;
    if (!span.textContent) {
      span.remove();
      return;
    }
    let next = span.nextSibling;
    while (next instanceof HTMLSpanElement && next.className === span.className && next.attributes.length === 1) {
      span.append(...Array.from(next.childNodes));
      next.remove();
      next = span.nextSibling;
    }
  });
}

/* Give the selected text a colour of one kind, or take that kind of colour away (name null). */
/* Colour spans the selection only partly covers are split, so the text outside the selection */
/* keeps its colour. Returns the range of the recoloured text, or null when nothing was selected. */
export function applyColor(range: Range, kind: ColorKind, name: ColorName | null) {
  const root = (range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)
    ?.closest('[data-note-editable]');
  const pieces = selectedText(range);
  if (!root || !pieces.length) return null;
  const selected = new Set<Node>(pieces);

  /* Spans of this kind around the selected text give their colour to the text outside the */
  /* selection, then are removed. */
  const spans = new Set<Element>();
  pieces.forEach(piece => {
    for (let element = piece.parentElement; element && element !== root; element = element.parentElement) {
      if (element.tagName === 'SPAN' && colorOf(element, kind)) spans.add(element);
    }
  });
  spans.forEach(span => {
    const color = colorOf(span, kind) as string;
    const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
    const outside: Text[] = [];
    while (walker.nextNode()) if (!selected.has(walker.currentNode)) outside.push(walker.currentNode as Text);
    outside.forEach(text => wrap(text, color));
    span.replaceWith(...Array.from(span.childNodes));
  });

  if (name) pieces.forEach(piece => wrap(piece, `${kind}-${name}`));
  tidy(root);

  const result = document.createRange();
  const last = pieces[pieces.length - 1];
  result.setStart(pieces[0], 0);
  result.setEnd(last, last.length);
  return result;
}
