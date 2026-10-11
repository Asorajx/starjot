import { describe, expect, it } from 'vitest';
import {
  addColumn, convertLine, createPageBlock, createTable, embeddedPageIds, handleBlockKeys, insertBlock, matchCommands, removeColumn
} from '../../src/frontend/notespace/editor/blocks';
import { parseBlocks } from '../../src/frontend/notespace/editor/blockModel';

/* An editable note body, like the continuous editor, added to the test page. */
function editor(html: string) {
  const body = document.createElement('div');
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

function press(key: string, shiftKey = false) {
  return new KeyboardEvent('keydown', { key, shiftKey, cancelable: true });
}


/* =========================
   Slash Command Menu
   ========================= */

describe('slash command list', () => {
  it('filters by name and keywords, with names that start with the text first', () => {
    const ids = matchCommands('sub', { inlineOnly: false, canAddPage: true }).map(command => command.id);
    expect(ids[0]).toBe('page');
    expect(ids).toContain('h2');
    expect(matchCommands('ul', { inlineOnly: false, canAddPage: true })[0].id).toBe('bullet');
  });

  it('hides Sub-page at the deepest level and only offers links inside table cells', () => {
    expect(matchCommands('', { inlineOnly: false, canAddPage: false }).some(command => command.id === 'page')).toBe(false);
    expect(matchCommands('', { inlineOnly: true, canAddPage: true }).map(command => command.id)).toEqual(['link']);
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

  it('replaces an empty line with a table and puts the caret in the first cell', () => {
    const body = editor('<p><br></p>');
    const change = insertBlock(body.querySelector('p') as HTMLElement, createTable());
    expect(body.querySelector('table')?.rows.length).toBe(3);
    expect(change.focus.tagName).toBe('TH');
    expect(body.lastElementChild?.outerHTML).toBe('<p><br></p>');
  });

  it('adds a page block below a line with text, followed by an empty line', () => {
    const body = editor('<p>Intro</p>');
    const change = insertBlock(body.querySelector('p') as HTMLElement, createPageBlock('child'));
    expect(body.innerHTML).toBe('<p>Intro</p><div class="page-block" data-page="child" data-size="small"></div><p><br></p>');
    expect(change.focus).toBe(body.lastElementChild);
    expect(embeddedPageIds(body.innerHTML)).toEqual(new Set(['child']));
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
    const cells = body.querySelectorAll('th');
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
    expect(table.rows[0].cells[1].tagName).toBe('TH');
    expect(removeColumn(table, 0)).toBe(true);
    expect(table.rows[1].cells.length).toBe(2);
  });

  it('Enter in a toggle title opens it and moves into its first line', () => {
    const body = editor('<div class="toggle-block"><p class="toggle-summary">Title</p><div class="toggle-body"><p>Line</p></div></div>');
    placeCaret(body.querySelector('.toggle-summary')?.firstChild as Node, 5);
    expect(handleBlockKeys(press('Enter'), body)).toEqual({ kind: 'changed' });
    expect(body.querySelector('.toggle-block')?.classList.contains('is-open')).toBe(true);
    expect(body.querySelector('.toggle-body')?.firstElementChild?.outerHTML).toBe('<p><br></p>');
  });

  it('Enter on an empty last line leaves the toggle', () => {
    const body = editor('<div class="toggle-block is-open"><p class="toggle-summary">T</p><div class="toggle-body"><p>A</p><p><br></p></div></div>');
    placeCaret(body.querySelectorAll('.toggle-body p')[1], 0);
    const result = handleBlockKeys(press('Enter'), body);
    expect(result?.kind).toBe('lines');
    expect(body.innerHTML).toBe('<div class="toggle-block is-open"><p class="toggle-summary">T</p><div class="toggle-body"><p>A</p></div></div><p><br></p>');
  });

  it('Backspace at the start of a toggle title turns it back into lines', () => {
    const body = editor('<div class="toggle-block is-open"><p class="toggle-summary">T</p><div class="toggle-body"><p>A</p></div></div>');
    placeCaret(body.querySelector('.toggle-summary')?.firstChild as Node, 0);
    expect(handleBlockKeys(press('Backspace'), body)?.kind).toBe('lines');
    expect(body.innerHTML).toBe('<p>T</p><p>A</p>');
  });
});
