import { GRAMMARS, LANGUAGES, type LanguageId } from './grammars';
import { closestAtCaret } from './dom';


/* =========================
   Highlighting
   ========================= */

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
}

export function languageOf(pre: Element | null): LanguageId {
  const match = pre?.querySelector('code')?.className.match(/language-([a-z]+)/);
  const id = match?.[1];
  return LANGUAGES.some(language => language.id === id) ? id as LanguageId : 'plain';
}

/* Wrap each recognised token in a span, escaping everything so code is shown as text. */
function highlightText(text: string, language: LanguageId) {
  const grammar = GRAMMARS[language];
  if (!grammar) return escapeHtml(text);

  let html = '';
  let last = 0;
  let match: RegExpExecArray | null;
  grammar.pattern.lastIndex = 0;

  while ((match = grammar.pattern.exec(text))) {
    /* Guard against zero-length matches, which would never advance. */
    if (!match[0]) {
      grammar.pattern.lastIndex += 1;
      continue;
    }
    const group = match.findIndex((value, index) => index > 0 && value !== undefined);
    html += `${escapeHtml(text.slice(last, match.index))}<span class="tok-${grammar.types[group - 1]}">${escapeHtml(match[0])}</span>`;
    last = match.index + match[0].length;
  }
  return html + escapeHtml(text.slice(last));
}

/* Read code as plain text; browsers may store line breaks as \n, <br> or new line elements. */
/* The final <br> is only a placeholder that lets the caret sit on an empty last line. */
function codeText(root: Node, keepTrailingBreak = false) {
  let text = '';
  let trailingBreak = false;

  const visit = (node: Node) => {
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent ?? '';
        if (child.textContent) trailingBreak = false;
      } else if (child.nodeName === 'BR') {
        text += '\n';
        trailingBreak = true;
      } else if (child instanceof Element) {
        if (['DIV', 'P'].includes(child.nodeName) && text && !text.endsWith('\n')) {
          text += '\n';
          trailingBreak = false;
        }
        visit(child);
      }
    });
  };
  visit(root);
  return trailingBreak && !keepTrailingBreak ? text.slice(0, -1) : text;
}

function caretOffset(pre: Element) {
  const selection = window.getSelection();
  if (!selection?.focusNode) return 0;
  const range = document.createRange();
  range.selectNodeContents(pre);
  range.setEnd(selection.focusNode, selection.focusOffset);
  const holder = document.createElement('div');
  holder.appendChild(range.cloneContents());
  return codeText(holder, true).length;
}

function setCaret(code: Element, offset: number) {
  const range = document.createRange();
  const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let placed = false;

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (remaining < node.length) {
      range.setStart(node, remaining);
      placed = true;
      break;
    }
    remaining -= node.length;
  }

  /* At the very end, sit before the placeholder <br> so an empty last line shows the caret. */
  if (!placed) {
    const placeholder = code.lastChild?.nodeName === 'BR' ? 1 : 0;
    range.setStart(code, code.childNodes.length - placeholder);
  }
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/* Keep exactly one <code> inside each code block and redraw its tokens. */
function write(pre: Element, text: string, language: LanguageId) {
  const code = pre.querySelector('code') ?? document.createElement('code');
  if (language === 'plain') code.removeAttribute('class');
  else code.className = `language-${language}`;
  code.innerHTML = highlightText(text, language) + (text === '' || text.endsWith('\n') ? '<br>' : '');
  if (pre.childNodes.length !== 1 || pre.firstChild !== code) pre.replaceChildren(code);
  return code;
}


/* =========================
   Code Block Actions
   ========================= */

/* Re-highlight one code block, keeping the caret in the same place when it is inside. */
export function highlight(pre: Element, language: LanguageId = languageOf(pre)) {
  const focusNode = window.getSelection()?.focusNode;
  const hasCaret = Boolean(focusNode && pre.contains(focusNode));
  const offset = hasCaret ? caretOffset(pre) : 0;
  const code = write(pre, codeText(pre), language);
  if (hasCaret) setCaret(code, offset);
}

export function highlightAll(root: Element | null) {
  root?.querySelectorAll('pre').forEach(pre => highlight(pre));
}

export function preAtCaret(root: Element) {
  const pre = closestAtCaret('pre');
  return pre && root.contains(pre) ? pre : null;
}

/* Enter inside code adds a new code line instead of leaving the block. */
export function insertNewline(pre: Element) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (!range.collapsed) range.deleteContents();

  const offset = caretOffset(pre);
  const text = codeText(pre);
  const code = write(pre, `${text.slice(0, offset)}\n${text.slice(offset)}`, languageOf(pre));
  setCaret(code, offset + 1);
}
