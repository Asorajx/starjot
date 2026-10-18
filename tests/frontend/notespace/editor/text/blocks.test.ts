import { describe, expect, it } from 'vitest';
import { convertLine, createPageBlock, createPageMention, createTable, insertBlock, insertInline } from '../../../../../src/frontend/notespace/editor/text/lines';
import { hydratePages, pageWidth, setPageWidth } from '../../../../../src/frontend/notespace/editor/text/pageBlocks';
import { handleBlockKeys, lineBelowTable } from '../../../../../src/frontend/notespace/editor/text/blockKeys';
import { matchCommands } from '../../../../../src/frontend/notespace/editor/text/slashCommands';
import { addColumn, removeColumn } from '../../../../../src/frontend/notespace/editor/tables/tables';
import { parseBlocks } from '../../../../../src/frontend/notespace/editor/text/blockModel';
import { cleanHtml } from '../../../../../src/frontend/notespace/sanitize';

/* An editable note body, like the continuous editor, added to the test page. */
function editor(html: string) {
  const body = document.createElement('div');
  body.className = 'note-body';
  body.contentEditable = 'true';
  body.innerHTML = html;
  document.body.replaceChildren(body);
  return body;
}

function placeCaret(node: Node, offset: number) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
}

function press(key: string, shiftKey = false, ctrlKey = false) {
  return new KeyboardEvent('keydown', { key, shiftKey, ctrlKey, cancelable: true });
}


/* =========================
   Slash Command Menu
   ========================= */

describe('slash command list', () => {
  it('filters by name and keywords, with names that start with the text first', () => {
    const ids = matchCommands('add', { inlineOnly: false, canAddPage: true }).map(command => command.id);
    expect(ids[0]).toBe('page');
    expect(matchCommands('sub', { inlineOnly: false, canAddPage: true }).map(command => command.id)).toEqual(['page', 'h2']);
    expect(matchCommands('ul', { inlineOnly: false, canAddPage: true })[0].id).toBe('bullet');
  });

  it('offers headings 1 to 5, as plain headings and as toggle headings', () => {
    const ids = matchCommands('heading', { inlineOnly: false, canAddPage: true }).map(command => command.id);
    expect(ids).toEqual(['h1', 'h2', 'h3', 'h4', 'h5', 'toggle-h1', 'toggle-h2', 'toggle-h3', 'toggle-h4', 'toggle-h5']);
  });

  it('matches every typed word against the start of the words in a command', () => {
    const ids = (query: string) => matchCommands(query, { inlineOnly: false, canAddPage: true }).map(command => command.id);
    expect(ids('tog 4')).toEqual(['toggle-h4']);
    expect(ids('h2')[0]).toBe('h2');
    expect(ids('num')[0]).toBe('numbered');
    expect(ids('head 3')).toEqual(['h3', 'toggle-h3']);
    expect(ids('zzz')).toEqual([]);
  });

  it('hides Sub-page at the deepest level, and offers only links, sub-pages and reminders inside table cells', () => {
    expect(matchCommands('', { inlineOnly: false, canAddPage: false }).some(command => command.id === 'page')).toBe(false);
    expect(matchCommands('', { inlineOnly: true, canAddPage: true }).map(command => command.id)).toEqual(['page', 'link', 'reminder']);
  });
});


/* =========================
   Converting and Inserting Lines
   ========================= */

describe('slash command lines', () => {
  it('turns a line into a heading and keeps its text', () => {
    const body = editor('<p>Hello</p>');
    const change = convertLine(body.querySelector('p') as HTMLElement, 'h2');
    expect(body.innerHTML).toBe('<h2>Hello</h2>');
    expect(change.atEnd).toBe(true);
  });

  it('makes a toggle list whose title is the line text', () => {
    const body = editor('<p>Details</p>');
    convertLine(body.querySelector('p') as HTMLElement, 'toggle');
    expect(body.innerHTML).toBe('<div class="toggle-block is-open"><p class="toggle-summary">Details</p><div class="toggle-body"><p><br></p></div></div>');
  });

  it('splits a list around a converted list item', () => {
    const body = editor('<ul><li>One</li><li>Two</li><li>Three</li></ul>');
    convertLine(body.querySelectorAll('li')[1] as HTMLElement, 'quote');
    expect(body.innerHTML).toBe('<ul><li>One</li></ul><blockquote><p>Two</p></blockquote><ul><li>Three</li></ul>');
  });

  it('starts new tables with every option off', () => {
    const table = createTable();
    expect(table.className).toBe('fit-content');
    expect(table.querySelectorAll('th')).toHaveLength(0);
    expect(table.querySelectorAll('td')).toHaveLength(9);
  });

  it('replaces an empty line with a table and puts the caret in the first cell', () => {
    const body = editor('<p><br></p>');
    const change = insertBlock(body.querySelector('p') as HTMLElement, createTable());
    expect(body.querySelector('table')?.rows.length).toBe(3);
    expect(change.focus.tagName).toBe('TD');
    expect(body.lastElementChild?.outerHTML).toBe('<p><br></p>');
  });

  it('moves the caret out of a page link before Enter, so the link is never split or copied', () => {
    const body = editor('<p>See <a class="page-link" data-page="atlas">Atlas</a> now</p>');
    const link = body.querySelector('a') as HTMLElement;
    placeCaret(link.firstChild as Node, 3);
    expect(handleBlockKeys(press('Enter'), body)).toBeNull();
    const after = window.getSelection()?.getRangeAt(0);
    expect(after?.startContainer).toBe(body.querySelector('p'));
    expect(after?.startOffset).toBe(2);

    placeCaret(link.firstChild as Node, 0);
    handleBlockKeys(press('Enter'), body);
    expect(window.getSelection()?.getRangeAt(0).startOffset).toBe(1);
  });

  it('places a page block inside the text at the caret, with room to keep typing after it', () => {
    const body = editor('<p>Before after</p>');
    const range = document.createRange();
    range.setStart(body.querySelector('p')?.firstChild as Node, 7);
    insertInline(range, createPageBlock('child'));
    expect(body.innerHTML).toBe('<p>Before <span class="page-block" data-page="child" data-size="small" data-width="100"></span> after</p>');
    expect(window.getSelection()?.focusNode?.textContent).toBe(' ');
  });

  it('keeps page blocks, tables and toggles as separate structured blocks', () => {
    const blocks = parseBlocks('<p>A</p><div class="page-block" data-page="x"></div><table><tbody><tr><td>1</td></tr></tbody></table><div class="toggle-block"><p class="toggle-summary">T</p><div class="toggle-body"><p>B</p></div></div>');
    expect(blocks).toHaveLength(4);
  });
});


/* =========================
   Tables and Toggles
   ========================= */

describe('table and toggle keys', () => {
  it('Tab moves to the next cell, and adds a row from the last cell', () => {
    const body = editor('');
    body.appendChild(createTable(2, 1));
    const cells = body.querySelectorAll('td');
    placeCaret(cells[1], 0);
    expect(handleBlockKeys(press('Tab'), body)).toEqual({ kind: 'changed' });
    expect(body.querySelector('table')?.rows.length).toBe(2);
  });

  it('Backspace at the start of a cell does nothing', () => {
    const body = editor('<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>');
    placeCaret(body.querySelectorAll('td')[1].firstChild as Node, 0);
    expect(handleBlockKeys(press('Backspace'), body)).toEqual({ kind: 'blocked' });
  });

  it('adds and removes columns', () => {
    const table = createTable(2, 2);
    addColumn(table, 0);
    expect(table.rows[0].cells.length).toBe(3);
    expect(table.rows[0].cells[1].tagName).toBe('TD');
    expect(removeColumn(table, 0)).toBe(true);
    expect(table.rows[1].cells.length).toBe(2);
  });

  it('Enter in a closed toggle title adds a line below the toggle and keeps it closed', () => {
    const body = editor('<div class="toggle-block"><p class="toggle-summary">Title</p><div class="toggle-body"><p>Line</p></div></div>');
    placeCaret(body.querySelector('.toggle-summary')?.firstChild as Node, 5);
    const result = handleBlockKeys(press('Enter'), body);
    expect(result?.kind).toBe('lines');
    expect(body.querySelector('.toggle-block')?.classList.contains('is-open')).toBe(false);
    expect(body.lastElementChild?.outerHTML).toBe('<p><br></p>');
  });

  it('Enter in an open toggle title moves into its first line', () => {
    const body = editor('<div class="toggle-block is-open"><p class="toggle-summary">Title</p><div class="toggle-body"><p>Line</p></div></div>');
    placeCaret(body.querySelector('.toggle-summary')?.firstChild as Node, 5);
    expect(handleBlockKeys(press('Enter'), body)).toEqual({ kind: 'changed' });
    expect(body.querySelector('.toggle-block')?.classList.contains('is-open')).toBe(true);
    expect(body.querySelector('.toggle-body')?.firstElementChild?.outerHTML).toBe('<p><br></p>');
  });

  it('Enter on an empty last line stays inside the toggle', () => {
    const body = editor('<div class="toggle-block is-open"><p class="toggle-summary">T</p><div class="toggle-body"><p>A</p><p><br></p></div></div>');
    placeCaret(body.querySelectorAll('.toggle-body p')[1], 0);
    expect(handleBlockKeys(press('Enter'), body)).toBeNull();
  });

  it('Backspace on an empty last line moves it out of the toggle', () => {
    const body = editor('<div class="toggle-block is-open"><p class="toggle-summary">T</p><div class="toggle-body"><p>A</p><p><br></p></div></div>');
    placeCaret(body.querySelectorAll('.toggle-body p')[1], 0);
    const result = handleBlockKeys(press('Backspace'), body);
    expect(result?.kind).toBe('lines');
    expect(body.innerHTML).toBe('<div class="toggle-block is-open"><p class="toggle-summary">T</p><div class="toggle-body"><p>A</p></div></div><p><br></p>');
  });

  it('Backspace at the start of the line below a toggle joins it to the toggle, keeping the toggle whole', () => {
    const body = editor('<div class="toggle-block is-open"><p class="toggle-summary">T</p><div class="toggle-body"></div></div><p>More</p>');
    placeCaret(body.querySelectorAll('p')[1].firstChild as Node, 0);
    expect(handleBlockKeys(press('Backspace'), body)?.kind).toBe('changed');
    expect(body.innerHTML).toBe('<div class="toggle-block is-open"><p class="toggle-summary">TMore</p><div class="toggle-body"></div></div>');
  });

  it('Backspace below an open toggle with lines joins its last line', () => {
    const body = editor('<div class="toggle-block is-open"><p class="toggle-summary">T</p><div class="toggle-body"><p>A</p></div></div><p><br></p>');
    placeCaret(body.querySelectorAll('p')[2], 0);
    handleBlockKeys(press('Backspace'), body);
    expect(body.innerHTML).toBe('<div class="toggle-block is-open"><p class="toggle-summary">T</p><div class="toggle-body"><p>A</p></div></div>');
  });

  it('Backspace in an empty toggle body moves the caret to the title instead of deleting the body', () => {
    const body = editor('<div class="toggle-block is-open"><p class="toggle-summary">T</p><div class="toggle-body"></div></div>');
    placeCaret(body.querySelector('.toggle-body') as Node, 0);
    expect(handleBlockKeys(press('Backspace'), body)?.kind).toBe('blocked');
    expect(body.querySelector('.toggle-body')).not.toBeNull();
    const caret = window.getSelection()?.anchorNode;
    expect((caret instanceof Element ? caret : caret?.parentElement)?.closest('.toggle-summary')).not.toBeNull();
  });

  it('Ctrl + Enter closes and opens a toggle, moving the caret out of a closed toggle', () => {
    const body = editor('<div class="toggle-block is-open"><p class="toggle-summary">T</p><div class="toggle-body"><p>A</p></div></div>');
    placeCaret(body.querySelector('.toggle-body p')?.firstChild as Node, 1);
    handleBlockKeys(press('Enter', false, true), body);
    expect(body.querySelector('.toggle-block')?.classList.contains('is-open')).toBe(false);
    expect(window.getSelection()?.anchorNode?.textContent).toBe('T');
    handleBlockKeys(press('Enter', false, true), body);
    expect(body.querySelector('.toggle-block')?.classList.contains('is-open')).toBe(true);
  });

  it('gives a toggle that lost its body a new one when Enter is pressed in its title', () => {
    const body = editor('<div class="toggle-block is-open"><p class="toggle-summary">T</p></div>');
    placeCaret(body.querySelector('.toggle-summary')?.firstChild as Node, 1);
    handleBlockKeys(press('Enter'), body);
    expect(body.querySelector('.toggle-body')?.innerHTML).toBe('<p><br></p>');
  });

  it('makes toggle headings, which stay headings when turned back into lines', () => {
    const body = editor('<p>Plan</p>');
    convertLine(body.querySelector('p') as HTMLElement, 'toggle-h2');
    expect(body.querySelector('.toggle-summary')?.outerHTML).toBe('<h2 class="toggle-summary">Plan</h2>');
    placeCaret(body.querySelector('h2')?.firstChild as Node, 0);
    handleBlockKeys(press('Backspace'), body);
    expect(body.innerHTML).toBe('<h2>Plan</h2>');
  });

  it('Backspace at the start of a toggle title turns it back into lines', () => {
    const body = editor('<div class="toggle-block is-open"><p class="toggle-summary">T</p><div class="toggle-body"><p>A</p></div></div>');
    placeCaret(body.querySelector('.toggle-summary')?.firstChild as Node, 0);
    expect(handleBlockKeys(press('Backspace'), body)?.kind).toBe('lines');
    expect(body.innerHTML).toBe('<p>T</p><p>A</p>');
  });
});


/* =========================
   List Keys
   ========================= */

describe('Backspace at the start of a list item', () => {
  it('turns the first item of a list at the top of a note into a normal line', () => {
    const body = editor('<ol><li>Design</li><li>Build</li></ol>');
    placeCaret(body.querySelector('li')?.firstChild as Node, 0);
    expect(handleBlockKeys(press('Backspace'), body)?.kind).toBe('lines');
    expect(body.innerHTML).toBe('<p>Design</p><ol><li>Build</li></ol>');
  });

  it('splits the list around an item in the middle, and keeps its own list below it', () => {
    const body = editor('<ul><li>a</li><li>b<ul><li>c</li></ul></li><li>d</li></ul>');
    placeCaret(body.querySelectorAll('li')[1].firstChild as Node, 0);
    handleBlockKeys(press('Backspace'), body);
    expect(body.innerHTML).toBe('<ul><li>a</li></ul><p>b</p><ul><li>c</li></ul><ul><li>d</li></ul>');
  });

  it('leaves Backspace elsewhere in the item, and in a list inside another, to the browser', () => {
    const body = editor('<ul><li>ab<ul><li>c</li></ul></li></ul>');
    placeCaret(body.querySelector('li')?.firstChild as Node, 1);
    expect(handleBlockKeys(press('Backspace'), body)).toBeNull();
    placeCaret(body.querySelector('ul ul li')?.firstChild as Node, 0);
    expect(handleBlockKeys(press('Backspace'), body)).toBeNull();
  });
});


/* =========================
   Checklists
   ========================= */

describe('checklists', () => {
  it('splits an item at the caret on Enter, and the new item starts unticked', () => {
    const body = editor('<ul class="checklist"><li class="is-checked">Buy milk</li></ul>');
    placeCaret(body.querySelector('li')?.firstChild as Node, 4);
    expect(handleBlockKeys(press('Enter'), body)?.kind).toBe('lines');
    expect(body.innerHTML).toBe('<ul class="checklist"><li class="is-checked">Buy </li><li>milk</li></ul>');
  });

  it('leaves the list on Enter in an empty item, keeping the items after it as a checklist', () => {
    const body = editor('<ul class="checklist"><li>a</li><li><br></li><li>b</li></ul>');
    placeCaret(body.querySelectorAll('li')[1], 0);
    handleBlockKeys(press('Enter'), body);
    expect(body.innerHTML).toBe('<ul class="checklist"><li>a</li></ul><p><br></p><ul class="checklist"><li>b</li></ul>');
  });

  it('is made from the slash menu and kept when saved', () => {
    const body = editor('<p>Pack</p>');
    convertLine(body.querySelector('p') as HTMLElement, 'checklist');
    expect(body.innerHTML).toBe('<ul class="checklist"><li>Pack</li></ul>');
    expect(cleanHtml('<ul class="checklist other"><li class="is-checked">a</li></ul>')).toBe('<ul class="checklist"><li class="is-checked">a</li></ul>');
    expect(matchCommands('todo', { inlineOnly: false, canAddPage: true })[0].id).toBe('checklist');
  });
});


/* =========================
   Moving Around Tables
   ========================= */

/* The test page cannot measure text, so every cell counts as one line, like an empty cell. */
describe('table arrow keys and the line below a table', () => {
  const table = '<table><tbody><tr><th>A1</th><th>B1</th></tr><tr><td>A2</td><td>B2</td></tr></tbody></table>';
  const caretText = () => window.getSelection()?.focusNode?.textContent;

  it('Right at the end of a cell moves to the next cell, Left at the start moves back', () => {
    const body = editor(`<p>Intro</p>${table}`);
    placeCaret(body.querySelector('th')?.firstChild as Node, 2);
    expect(handleBlockKeys(press('ArrowRight'), body)).toEqual({ kind: 'blocked' });
    expect(caretText()).toBe('B1');
    placeCaret(body.querySelectorAll('th')[1].firstChild as Node, 0);
    expect(handleBlockKeys(press('ArrowLeft'), body)).toEqual({ kind: 'blocked' });
    expect(caretText()).toBe('A1');
  });

  it('Down moves to the cell below in the same column', () => {
    const body = editor(table);
    placeCaret(body.querySelectorAll('th')[1].firstChild as Node, 1);
    expect(handleBlockKeys(press('ArrowDown'), body)).toEqual({ kind: 'blocked' });
    expect(caretText()).toBe('B2');
  });

  it('Left from the first cell goes to the line above the table', () => {
    const body = editor(`<p>Intro</p>${table}`);
    placeCaret(body.querySelector('th')?.firstChild as Node, 0);
    handleBlockKeys(press('ArrowLeft'), body);
    expect(caretText()).toBe('Intro');
  });

  it('Down from the last row adds a line when the table is last in the note', () => {
    const body = editor(table);
    placeCaret(body.querySelectorAll('td')[1].firstChild as Node, 1);
    const result = handleBlockKeys(press('ArrowDown'), body);
    expect(result?.kind).toBe('lines');
    expect(body.lastElementChild?.outerHTML).toBe('<p><br></p>');
  });

  it('Up from the line under a table goes into its last row', () => {
    const body = editor(`${table}<p>After</p>`);
    placeCaret(body.querySelector('p')?.firstChild as Node, 2);
    expect(handleBlockKeys(press('ArrowUp'), body)).toEqual({ kind: 'blocked' });
    expect(caretText()).toBe('A2');
  });

  it('reuses an empty line under a table instead of adding another', () => {
    const body = editor(`${table}<p><br></p>`);
    const below = lineBelowTable(body.querySelector('table') as HTMLElement);
    expect(below.created).toBe(false);
    expect(below.line).toBe(body.lastElementChild);
    body.lastElementChild?.remove();
    expect(lineBelowTable(body.querySelector('table') as HTMLElement).created).toBe(true);
  });
});


/* =========================
   Page Block Width
   ========================= */

describe('page block width', () => {
  it('starts as wide as the line, snaps to steps of 5% between 25% and 100%, and can go back to fitting its title', () => {
    const block = createPageBlock('child');
    expect(pageWidth(block)).toBe(100);
    expect(setPageWidth(block, 47)).toBe(45);
    expect(block.dataset.width).toBe('45');
    expect(block.style.width).toBe('45%');
    expect(setPageWidth(block, 5)).toBe(25);
    expect(setPageWidth(block, 140)).toBe(100);
    setPageWidth(block, null);
    expect(block.hasAttribute('data-width')).toBe(false);
    expect(block.hasAttribute('style')).toBe(false);
  });
});


/* =========================
   Page Mentions
   ========================= */

describe('page mentions', () => {
  it('are stored empty, holding only the page id', () => {
    const mention = createPageMention('atlas');
    expect(cleanHtml(`<p>See ${mention.outerHTML}</p>`)).toBe('<p>See <span class="page-mention" data-page="atlas"></span></p>');
    expect(cleanHtml('<span class="page-mention" data-page="atlas" contenteditable="false"><span>Old title</span></span>'))
      .toBe('<span class="page-mention" data-page="atlas"></span>');
  });

  it("show the page's icon and current title as text that cannot be edited", () => {
    const body = editor(`<p>${createPageMention('atlas').outerHTML}${createPageMention('gone').outerHTML}</p>`);
    hydratePages(body);
    const [found, missing] = Array.from(body.querySelectorAll<HTMLElement>('.page-mention'));
    expect(found.contentEditable).toBe('false');
    expect(found.querySelector('.page-mention-title')?.textContent).toBe('Project Atlas — Research brief');
    expect(missing.classList.contains('is-missing')).toBe(true);
    expect(missing.textContent).toBe('Note not found');
  });
});
