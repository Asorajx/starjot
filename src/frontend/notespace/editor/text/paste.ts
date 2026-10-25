import { cleanHtml } from '../../sanitize';
import { deleteKeepingPages } from './pageBlocks';
import { highlight } from '../code/code';
import { isEmptyContent } from './dom';
import { getNote, noteTitle } from '../../store';
import { copiedPageLink, createLink, normalizeAddress, pageIdFromAddress, trimAddress, type LinkTarget } from '../links/links';
import { elementOf } from '../../../lib/nodes';

/* Code fence languages written in Markdown, and the code block language each one becomes. */
const FENCE_LANGUAGES: Record<string, string> = {
  js: 'javascript', javascript: 'javascript', jsx: 'javascript', ts: 'typescript', typescript: 'typescript', tsx: 'typescript',
  html: 'html', xml: 'html', css: 'css', json: 'json', py: 'python', python: 'python', java: 'java',
  cs: 'csharp', csharp: 'csharp', 'c#': 'csharp', c: 'cpp', cpp: 'cpp', 'c++': 'cpp', sql: 'sql',
  sh: 'bash', bash: 'bash', shell: 'bash', zsh: 'bash', console: 'bash'
};

/* Inline Markdown, in the order it is matched: an escaped character such as \*, `code`, */
/* [words](address), a web address written on its own (https://…, www.…), **bold** or __bold__, */
/* ~~strike~~, and *italic* or _italic_. The address may hold one level of brackets, as in many */
/* Wikipedia addresses. Underscores inside words (file_name_here) are not italics. */
const INLINE = new RegExp([
  /\\([\\`*_~[\]()#>+\-.!|])/.source,
  /`([^`\n]+)`/.source,
  /\[([^[\]\n]+)\]\(([^()\s]+(?:\([^()\s]*\)[^()\s]*)*)\)/.source,
  /((?:https?:\/\/|www\.)[^\s<>"'`]+)/.source,
  /\*\*(?=\S)(.+?)(?<=\S)\*\*/.source,
  /(?<!\w)__(?=\S)(.+?)(?<=\S)__(?!\w)/.source,
  /~~(?=\S)(.+?)(?<=\S)~~/.source,
  /\*(?=[^\s*])([^*]+?)(?<=\S)\*/.source,
  /(?<!\w)_(?=[^\s_])([^_]+?)(?<=\S)_(?!\w)/.source
].join('|'), 'g');

const FENCE = /^\s*(```+|~~~+)\s*([\w#+-]*)\s*$/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const DIVIDER = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;

/* The box at the start of a checklist item's text: "[ ]", "[]" or "[x]". */
const CHECKBOX = /^\[([ xX]?)\](?:\s+|$)/;

/* A table row (| a | b |) and the line under a table's header row (| --- | :---: |). */
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/* A row of tab-separated text, as spreadsheets and documents copy tables: a tab between words. */
/* Tabs only at the start of a line are indenting (as in a nested list), not cells. */
const TAB_ROW = /\S.*\t/;

/* The caret's line: a paragraph, heading, list item or plain line, but not a wrapper such as a */
/* sticky group or toggle list. */
const LINE = 'p, h1, h2, h3, h4, h5, h6, li, div:not(.sticky-group):not(.toggle-block):not(.toggle-body)';

/* Table cells and toggle titles hold a single line, so pasted lines are joined with line breaks there. */
const SINGLE_LINE = 'td, th, .toggle-summary';


/* =========================
   Reading Pasted Markdown
   ========================= */

function element(tag: string, children: (Node | string)[]) {
  const made = document.createElement(tag);
  made.append(...children);
  return made;
}

/* Where an address leads: the page it names (see pageAddress) when this browser has that page, */
/* or else the web address, or null when it is neither. */
function addressTarget(address: string): LinkTarget | null {
  const page = pageIdFromAddress(address);
  if (page && getNote(page)) return { kind: 'page', id: page };
  const href = normalizeAddress(address);
  return href ? { kind: 'url', href } : null;
}

/* The words of one line with their inline Markdown turned into bold, italic, code and link elements. */
function inlineNodes(text: string): (Node | string)[] {
  const nodes: (Node | string)[] = [];
  let last = 0;

  /* matchAll works on its own copy of the pattern, so the inner calls for nested formatting are safe. */
  for (const match of text.matchAll(INLINE)) {
    const [whole, escaped, code, words, address, written, bold, boldLine, strike, italic, italicLine] = match;
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    last = index + whole.length;

    if (escaped !== undefined) {
      nodes.push(escaped);
    } else if (code !== undefined) {
      nodes.push(element('code', [code]));
    } else if (words !== undefined) {
      const target = addressTarget(address);
      if (!target) {
        nodes.push(whole);
        continue;
      }
      const link = createLink('', target);
      link.append(...inlineNodes(words));
      nodes.push(link);
    } else if (written !== undefined) {
      /* A written address becomes a link showing the address, or the page's title for a page. */
      /* Punctuation after it (such as a full stop) stays text. */
      const { address: trimmed, rest } = trimAddress(written);
      const target = addressTarget(trimmed);
      if (!target) nodes.push(trimmed);
      else nodes.push(createLink(target.kind === 'page' ? noteTitle(getNote(target.id)) : trimmed, target));
      if (rest) nodes.push(rest);
    } else if (bold !== undefined || boldLine !== undefined) {
      nodes.push(element('strong', inlineNodes(bold ?? boldLine)));
    } else if (strike !== undefined) {
      nodes.push(element('s', inlineNodes(strike)));
    } else {
      nodes.push(element('em', inlineNodes(italic ?? italicLine)));
    }
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/* A line element holding the formatted words, kept open with a <br> when it has none. */
function line(tag: string, text: string) {
  const made = element(tag, inlineNodes(text));
  if (!made.childNodes.length) made.append(document.createElement('br'));
  return made;
}

/* The cells of a table row, split at each | that is not written as \|. */
function tableCells(row: string) {
  return row.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map(cell => cell.trim());
}

/* A Markdown table as a note table: its first row becomes the header row, and short rows are */
/* filled with empty cells so every row is as wide as the widest. */
function markdownTable(rows: string[][]) {
  const width = Math.max(...rows.map(row => row.length));
  const table = document.createElement('table');
  table.className = 'fit-content';
  const body = table.appendChild(document.createElement('tbody'));
  rows.forEach((cells, index) => {
    const row = body.appendChild(document.createElement('tr'));
    for (let column = 0; column < width; column += 1) row.append(line(index ? 'td' : 'th', cells[column] ?? ''));
  });
  return table;
}

/* How far a list item is indented; a tab counts as four spaces. */
function indentOf(space: string) {
  return space.replace(/\t/g, '    ').length;
}

/* Turn Markdown text into note lines: paragraphs, headings, lists (nested by indenting), quotes, */
/* code blocks, tables and dividers. Every line of text becomes its own line, as with plain pasting, but */
/* blank lines are left out because in Markdown they only separate paragraphs. Two or more */
/* tab-separated lines in a row (copied from a spreadsheet or a document's table) become a table too. */
export function markdownLines(plain: string) {
  const blocks: HTMLElement[] = [];
  let lists: { indent: number; list: HTMLElement }[] = [];
  let quote: HTMLElement | null = null;
  const lines = plain.replace(/\r\n?/g, '\n').split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index];
    const fence = text.match(FENCE);
    const heading = text.match(HEADING);
    const divider = DIVIDER.test(text);
    const listed = divider ? null : text.match(LIST_ITEM);
    const quoted = text.match(QUOTE);

    /* A numbered list starts at 1. Any other number starts no list unless it carries on a */
    /* numbered list above, so a section heading such as "11. Design" keeps its number as text. */
    const continues = lists.some(frame => frame.list.tagName === 'OL');
    const item = listed && /^\d/.test(listed[2]) && parseInt(listed[2], 10) !== 1 && !continues ? null : listed;

    /* Lists continue past blank lines, so items separated by a blank line stay in one list. */
    if (!text.trim()) {
      quote = null;
      continue;
    }
    if (!item) lists = [];
    if (!quoted) quote = null;

    if (TABLE_ROW.test(text) && TABLE_RULE.test(lines[index + 1] ?? '') && lines[index + 1].includes('|')) {
      /* A table runs from its header row, past the rule under it, to the last row in a row. */
      const rows = [tableCells(text)];
      index += 1;
      while (index + 1 < lines.length && TABLE_ROW.test(lines[index + 1])) rows.push(tableCells(lines[++index]));
      blocks.push(markdownTable(rows));
    } else if (TAB_ROW.test(text) && TAB_ROW.test(lines[index + 1] ?? '')) {
      const rows = [text.split('\t').map(cell => cell.trim())];
      while (index + 1 < lines.length && TAB_ROW.test(lines[index + 1])) rows.push(lines[++index].split('\t').map(cell => cell.trim()));
      blocks.push(markdownTable(rows));
    } else if (fence) {
      /* Code keeps every line exactly as written, until the closing fence or the end of the text. */
      const code: string[] = [];
      while (index + 1 < lines.length && !lines[index + 1].trim().startsWith(fence[1])) code.push(lines[++index]);
      index += 1;
      const language = FENCE_LANGUAGES[fence[2].toLowerCase()];
      const codeElement = element('code', [code.join('\n')]);
      if (language) codeElement.className = `language-${language}`;
      blocks.push(element('pre', [codeElement]));
    } else if (heading) {
      blocks.push(line(`h${Math.min(heading[1].length, 5)}`, heading[2]));
    } else if (divider) {
      blocks.push(document.createElement('hr'));
    } else if (item) {
      const indent = indentOf(item[1]);
      const kind = /\d/.test(item[2]) ? 'ol' : 'ul';

      /* "- [ ]" and "- [x]" are checklist items. */
      const box = kind === 'ul' ? item[3].match(CHECKBOX) : null;
      const listKind = box ? 'checklist' : kind;
      while (lists.length > 1 && lists[lists.length - 1].indent > indent) lists.pop();
      const frame = lists[lists.length - 1];
      const kindOf = (list: HTMLElement) => (list.classList.contains('checklist') ? 'checklist' : list.tagName.toLowerCase());

      /* A deeper item starts a list inside the previous item; a different kind of list at the same */
      /* depth starts a new list beside it. */
      if (!frame || indent > frame.indent || kindOf(frame.list) !== listKind) {
        const list = document.createElement(kind);
        if (box) list.className = 'checklist';
        const deeper = Boolean(frame && indent > frame.indent);
        const parent = deeper ? frame : lists[lists.length - 2];
        if (parent) (parent.list.lastElementChild ?? parent.list).append(list);
        else blocks.push(list);
        if (deeper || !frame) lists.push({ indent, list });
        else lists[lists.length - 1] = { indent, list };
      }
      const listItem = line('li', box ? item[3].slice(box[0].length) : item[3]);
      if (box?.[1].trim()) listItem.className = 'is-checked';
      lists[lists.length - 1].list.append(listItem);
    } else if (quoted) {
      if (!quote) {
        quote = document.createElement('blockquote');
        blocks.push(quote);
      }
      quote.append(line('p', quoted[1]));
    } else {
      blocks.push(line('p', text));
    }
  }
  return blocks;
}

/* Lines are only HTML the note allows; a template's contents are inert while they are read. */
function cleaned(blocks: HTMLElement[]) {
  const holder = document.createElement('template');
  holder.innerHTML = cleanHtml(blocks.map(block => block.outerHTML).join(''));
  return Array.from(holder.content.children) as HTMLElement[];
}

/* The note lines for pasted text, or null when it has no Markdown, so it is pasted as plain text */
/* (unless always is true). A page link copied from a note (the clipboard's HTML) pastes as the */
/* same page link. */
export function pastedMarkdown(plain: string, html = '', always = false): HTMLElement[] | null {
  const page = copiedPageLink(html, plain);
  if (page) return cleaned([element('p', [createLink(plain, page)])]);

  const blocks = markdownLines(plain);
  const formatted = blocks.some(block => block.tagName !== 'P' || block.querySelector('*:not(br)'));
  return formatted || always ? cleaned(blocks) : null;
}


/* =========================
   Inserting Pasted Lines
   ========================= */

/* Each pasted line as inline content: one per paragraph, heading, list item, quote line or code line. */
function inlineLines(blocks: HTMLElement[]) {
  const lines: Node[][] = [];
  blocks.forEach(block => {
    if (block.tagName === 'PRE') {
      (block.textContent ?? '').split('\n').forEach(text => lines.push([document.createTextNode(text)]));
    } else if (block.tagName === 'TABLE') {
      /* A table pasted where only words can go keeps one line per row, its cells apart by tabs. */
      block.querySelectorAll('tr').forEach(row => {
        lines.push(Array.from(row.children).flatMap((cell, index) => [...(index ? [document.createTextNode('\t')] : []), ...Array.from(cell.childNodes)]));
      });
    } else if (['UL', 'OL', 'BLOCKQUOTE'].includes(block.tagName)) {
      block.querySelectorAll('li, p').forEach(item => {
        lines.push(Array.from(item.childNodes).filter(node => !['UL', 'OL', 'BR'].includes(node.nodeName)));
      });
    } else if (block.tagName !== 'HR') {
      lines.push(Array.from(block.childNodes).filter(node => node.nodeName !== 'BR'));
    }
  });
  return lines;
}

/* The innermost last line of a pasted block, where text after the caret can join it. */
function lastLineOf(block: HTMLElement) {
  let last: Element = block;
  while (['UL', 'OL', 'BLOCKQUOTE', 'LI'].includes(last.tagName) && last.lastElementChild && ['UL', 'OL', 'LI', 'P'].includes(last.lastElementChild.tagName)) {
    last = last.lastElementChild;
  }
  if (last.tagName === 'PRE') return last.querySelector('code') ?? last;
  return last;
}

function hasContent(element: Element) {
  return !isEmptyContent(element);
}

/* Remove any trailing <br> that only kept an empty line open, before text joins the line. */
function trimBreak(element: Element) {
  if (element.lastChild?.nodeName === 'BR') element.lastChild.remove();
}

/* Delete selected text before pasting over it, joining the lines it ran across like normal deleting. */
/* Page blocks in the selection are kept, as with typing over a selection. */
export function deleteSelection(root: HTMLElement) {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  if (!range || range.collapsed || !root.contains(range.commonAncestorContainer)) return;
  if (deleteKeepingPages(range, root)) return;
  if (!document.execCommand('delete')) range.deleteContents();
}

/* Insert pasted lines at the caret, inside root. The first line joins the text before the caret and */
/* the text after the caret joins the last line, like pasting in any editor. The caret goes to the end */
/* of the pasted text. Returns the line that holds the caret, and whether new lines were added. */
export function insertPasted(root: HTMLElement, blocks: HTMLElement[]) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !blocks.length) return null;
  const range = selection.getRangeAt(0);
  range.collapse(true);
  const start = elementOf(range.startContainer);
  const found = start?.closest(LINE);
  const current = found && found !== root && root.contains(found) ? found as HTMLElement : null;
  const caret = document.createRange();

  /* One line of text, or a place that holds a single line: the words go straight in at the caret. */
  if (!current || start?.closest(SINGLE_LINE) || (blocks.length === 1 && blocks[0].tagName === 'P')) {
    const fragment = document.createDocumentFragment();
    inlineLines(blocks).forEach((nodes, index) => {
      if (index) fragment.append(document.createElement('br'));
      fragment.append(...nodes);
    });
    const last = fragment.lastChild;

    /* An empty line only holds a <br> to keep it open, which the pasted words replace. */
    if (current && !hasContent(current) && !start?.closest(SINGLE_LINE)) {
      current.replaceChildren();
      range.setStart(current, 0);
      range.collapse(true);
    }
    range.insertNode(fragment);
    if (last) caret.setStartAfter(last);
    else caret.setStart(range.startContainer, range.startOffset);
    selection.removeAllRanges();
    selection.addRange(caret);
    return { line: current ?? root, added: false };
  }

  /* Move the text after the caret into a copy of its line, so the pasted lines go between them. */
  const tail = document.createRange();
  tail.setStart(range.startContainer, range.startOffset);
  tail.setEnd(current, current.childNodes.length);
  const after = current.cloneNode(false) as HTMLElement;
  after.append(tail.extractContents());

  /* Inside a list, every pasted line becomes an item of that list. */
  const pasted = current.tagName === 'LI'
    ? inlineLines(blocks).map(nodes => element('li', nodes.length ? nodes : [document.createElement('br')]))
    : blocks;

  /* The first line joins the text before the caret when both are text lines (or both list items). */
  const first = pasted[0];
  if (first && (first.tagName === 'P' || first.tagName === 'LI')) {
    if (!hasContent(current)) current.replaceChildren();
    else trimBreak(current);
    current.append(...Array.from(first.childNodes).filter(node => node.nodeName !== 'BR'));
    if (!current.childNodes.length) current.append(document.createElement('br'));
    pasted.shift();
  }
  current.after(...pasted);
  const keepsCurrent = hasContent(current) || pasted.length === 0;

  /* The text after the caret joins the last pasted line, unless that line is code, a divider or */
  /* a table. */
  const lastBlock = pasted[pasted.length - 1];
  const joined = lastBlock ? lastLineOf(lastBlock) : current;
  const canJoin = !['HR', 'CODE', 'TABLE'].includes(joined.tagName);
  if (canJoin && hasContent(after)) {
    if (!hasContent(joined)) joined.replaceChildren();
    else trimBreak(joined);
    caret.setStart(joined, joined.childNodes.length);
    joined.append(...Array.from(after.childNodes));
  } else if (hasContent(after) || !canJoin) {
    /* After code, a divider or a table, the caret goes to the start of the next line. */
    if (!after.childNodes.length) after.append(document.createElement('br'));
    (lastBlock ?? current).after(after);
    if (canJoin) caret.setStart(joined, joined.childNodes.length);
    else caret.setStart(after, 0);
  } else {
    caret.setStart(joined, joined.childNodes.length);
  }
  if (!keepsCurrent) current.remove();

  blocks.forEach(block => {
    if (block.tagName === 'PRE' && block.isConnected) highlight(block);
  });

  selection.removeAllRanges();
  selection.addRange(caret);
  const holder = elementOf(caret.startContainer);
  return { line: (holder?.closest(LINE) ?? holder ?? root) as HTMLElement, added: true };
}
