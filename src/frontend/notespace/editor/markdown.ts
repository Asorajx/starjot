import { emptyParagraph, placeCaret } from './dom';


/* =========================
   Markdown Shortcut Definitions
   ========================= */

/* These shortcuts format the document as HTML, which is Notespace's storage format. */
/* Raw Markdown is never stored. */
type Marker =
  | { kind: 'heading'; level: number }
  | { kind: 'bullet' | 'numbered' | 'quote' | 'code' | 'divider' };

function markerType(text: string): Marker | null {
  if (/^#{1,5}$/.test(text)) return { kind: 'heading', level: text.length };
  if (['-', '*', '+'].includes(text)) return { kind: 'bullet' };
  if (text === '1.') return { kind: 'numbered' };
  if (text === '>') return { kind: 'quote' };
  if (text === '```') return { kind: 'code' };
  if (text === '---') return { kind: 'divider' };
  return null;
}

function emptyElement(tag: string) {
  const element = document.createElement(tag);
  element.appendChild(document.createElement('br'));
  return element;
}

/* Build the element for a marker, and the element the caret should move into. */
function replacementFor(marker: Marker): { element: HTMLElement; focus: HTMLElement | null } {
  if (marker.kind === 'heading') {
    const heading = emptyElement(`h${marker.level}`);
    return { element: heading, focus: heading };
  }
  if (marker.kind === 'bullet' || marker.kind === 'numbered') {
    const list = document.createElement(marker.kind === 'bullet' ? 'ul' : 'ol');
    const item = list.appendChild(emptyElement('li'));
    return { element: list, focus: item };
  }
  if (marker.kind === 'quote') {
    const quote = document.createElement('blockquote');
    const paragraph = quote.appendChild(emptyElement('p'));
    return { element: quote, focus: paragraph };
  }
  if (marker.kind === 'code') {
    const pre = document.createElement('pre');
    const code = pre.appendChild(emptyElement('code'));
    return { element: pre, focus: code };
  }
  return { element: document.createElement('hr'), focus: null };
}


/* =========================
   Keyboard Shortcut
   ========================= */

/* Return the active line's element, or the editor itself for an editor with loose text. */
function currentLine(editable: HTMLElement, selection: Selection) {
  const node = selection.anchorNode;
  if (!node || !editable.contains(node)) return null;
  const element = node instanceof Element ? node : node.parentElement;
  if (!element || element.closest('pre, code')) return null;

  /* Sticky group wrappers are not lines, so a marker never replaces a whole group. */
  const line = element.closest<HTMLElement>('p, h1, h2, h3, h4, h5, h6, li, blockquote, div:not(.sticky-group)');
  return line && editable.contains(line) ? line : editable;
}

/* Check only the text before the caret; a marker has to be the only content on its line. */
function getMarker(line: HTMLElement, selection: Selection) {
  if (!selection.isCollapsed || !selection.anchorNode) return null;
  const beforeCaret = document.createRange();
  beforeCaret.selectNodeContents(line);
  beforeCaret.setEnd(selection.anchorNode, selection.anchorOffset);
  const before = beforeCaret.toString().replace(/​/g, '');
  if (before !== (line.textContent ?? '').replace(/​/g, '')) return null;
  return markerType(before);
}

/* Converts a marker typed at the start of an empty line. Returns true when it changed the document. */
/* Space converts headings, lists and quotes; Enter converts ``` (code) and --- (divider). */
export function applyMarkdownShortcut(event: KeyboardEvent, editable: HTMLElement) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return false;
  if (event.key !== ' ' && event.key !== 'Enter') return false;

  const selection = window.getSelection();
  if (!selection?.rangeCount) return false;
  const line = currentLine(editable, selection);
  const marker = line ? getMarker(line, selection) : null;
  if (!line || !marker) return false;
  if (event.key === 'Enter' && marker.kind !== 'code' && marker.kind !== 'divider') return false;

  /* In a toggle's title only "#" to "#####" work, turning it into a toggle heading. */
  if (line.classList.contains('toggle-summary')) {
    if (marker.kind !== 'heading') return false;
    event.preventDefault();
    const heading = emptyElement(`h${marker.level}`);
    heading.className = 'toggle-summary';
    line.replaceWith(heading);
    placeCaret(heading);
    return true;
  }

  event.preventDefault();
  const { element, focus } = replacementFor(marker);
  if (line === editable) editable.replaceChildren(element);
  else line.replaceWith(element);

  /* After a divider, the caret moves into a new paragraph below it. */
  if (focus) {
    placeCaret(focus);
  } else {
    const paragraph = emptyParagraph();
    element.after(paragraph);
    placeCaret(paragraph);
  }
  return true;
}
