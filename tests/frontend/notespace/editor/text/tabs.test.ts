import { describe, expect, it } from 'vitest';
import {
  activateTab, addTab, breaksTabBlock, createTabBlock, emptyTabAtCaret, hydrateTabs, removeEmptyTab, removeTab, renameTab, showTabOf, tabKeys, tabPathOf, tabPanels
} from '../../../../../src/frontend/notespace/editor/text/tabs';
import { matchCommands } from '../../../../../src/frontend/notespace/editor/text/slashCommands';
import { blockType, parseBlocks } from '../../../../../src/frontend/notespace/editor/text/blockModel';
import { cleanHtml } from '../../../../../src/frontend/notespace/sanitize';
import { getLength, setOffset } from '../../../../../src/frontend/notespace/editor/text/caret';

const TABS = '<div class="tab-block"><div class="tab-panel is-active" data-title="Setup"><h2>Install</h2><p>Run it.</p></div>'
  + '<div class="tab-panel" data-title="Usage"><h2>Start</h2><p>Open it.</p></div></div>';

/* An editable note body, like the continuous editor, added to the test page. */
function editor(html: string) {
  const body = document.createElement('div');
  body.contentEditable = 'true';
  body.innerHTML = html;
  document.body.replaceChildren(body);
  hydrateTabs(body);
  return body;
}

function placeCaret(node: Node, offset: number) {
  const range = document.createRange();
  range.setStart(node, offset);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
}

function press(key: string) {
  return new KeyboardEvent('keydown', { key, cancelable: true });
}

/* The names on a block's strip, the shown one marked with *. */
function strip(block: Element) {
  return Array.from(block.querySelectorAll('.tab-strip-tab')).map(tab => `${tab.textContent}${tab.classList.contains('is-active') ? '*' : ''}`);
}


/* =========================
   Tab Blocks
   ========================= */

describe('tab blocks', () => {
  it('start with two tabs, the first shown, and a strip that is never saved', () => {
    const block = createTabBlock();
    expect(strip(block)).toEqual(['Tab 1*', 'Tab 2']);
    expect(block.querySelector('.tab-strip')?.getAttribute('contenteditable')).toBe('false');
    expect(cleanHtml(block.outerHTML)).toBe(
      '<div class="tab-block"><div class="tab-panel is-active" data-title="Tab 1"><p><br></p></div><div class="tab-panel" data-title="Tab 2"><p><br></p></div></div>'
    );
  });

  it('switches, adds, renames and removes tabs, keeping at least one', () => {
    const block = editor(TABS).querySelector('.tab-block') as HTMLElement;
    activateTab(block, 1);
    expect(strip(block)).toEqual(['Setup', 'Usage*']);
    const line = addTab(block);
    expect(strip(block)).toEqual(['Setup', 'Usage', 'Tab 3*']);
    expect(line.parentElement?.classList.contains('is-active')).toBe(true);
    renameTab(block, 2, '  Notes  ');
    expect(strip(block)).toEqual(['Setup', 'Usage', 'Notes*']);
    removeTab(block, 2);
    removeTab(block, 0);
    expect(strip(block)).toEqual(['Usage*']);
    removeTab(block, 0);
    expect(tabPanels(block)).toHaveLength(1);
  });

  it('shows the tab holding a heading, and names the tabs it sits in', () => {
    const body = editor(TABS);
    const heading = body.querySelectorAll('h2')[1];
    expect(tabPathOf(heading)).toEqual(['Usage']);
    expect(showTabOf(heading)).toBe(true);
    expect(strip(body.querySelector('.tab-block') as Element)).toEqual(['Setup', 'Usage*']);
    expect(showTabOf(heading)).toBe(false);
  });

  it('keeps Backspace and Delete from breaking the block, and moves an empty last line out', () => {
    const body = editor(`<p>Above</p>${TABS}<p>Below</p>`);
    placeCaret(body.querySelector('.tab-panel h2')?.firstChild as Node, 0);
    expect(tabKeys(press('Backspace'))).toEqual({ kind: 'blocked' });
    placeCaret(body.lastElementChild?.firstChild as Node, 0);
    expect(tabKeys(press('Backspace'))).toEqual({ kind: 'blocked' });
    placeCaret(body.querySelector('p')?.firstChild as Node, 5);
    expect(tabKeys(press('Delete'))).toEqual({ kind: 'blocked' });

    const panel = body.querySelector('.tab-panel.is-active') as HTMLElement;
    panel.append(Object.assign(document.createElement('p'), { innerHTML: '<br>' }));
    placeCaret(panel.lastElementChild as Node, 0);
    expect(tabKeys(press('Backspace'))?.kind).toBe('lines');
    expect(body.querySelector('.tab-block')?.nextElementSibling?.outerHTML).toBe('<p><br></p>');
  });

  it('removes an empty tab on Backspace, and the whole block with its last tab', () => {
    const body = editor('<div class="tab-block"><div class="tab-panel" data-title="A"><p>Kept</p></div><div class="tab-panel is-active" data-title="B"><p><br></p></div></div>');
    placeCaret(body.querySelector('.tab-panel.is-active p') as Node, 0);
    const emptied = emptyTabAtCaret(press('Backspace'));
    expect(emptied?.dataset.title).toBe('B');
    expect(removeEmptyTab(emptied as HTMLElement).textContent).toBe('Kept');
    expect(strip(body.querySelector('.tab-block') as Element)).toEqual(['A*']);

    placeCaret(body.querySelector('.tab-panel p')?.firstChild as Node, 0);
    expect(emptyTabAtCaret(press('Backspace'))).toBeNull();
    body.querySelector('.tab-panel p')?.replaceChildren(document.createElement('br'));
    placeCaret(body.querySelector('.tab-panel p') as Node, 0);
    removeEmptyTab(emptyTabAtCaret(press('Backspace')) as HTMLElement);
    expect(body.innerHTML).toBe('<p><br></p>');
  });

  it('refuses selections that reach into a hidden tab or out of the block, unless they cover it', () => {
    const body = editor(`<p>Above</p>${TABS}<p>Below</p>`);
    const range = document.createRange();
    const shown = body.querySelector('.tab-panel.is-active p') as Element;
    range.setStart(shown.firstChild as Node, 0);
    range.setEnd(shown.firstChild as Node, 3);
    expect(breaksTabBlock(range, body)).toBe(false);
    range.setEnd(body.lastElementChild?.firstChild as Node, 2);
    expect(breaksTabBlock(range, body)).toBe(true);
    range.setStart(body.firstElementChild?.firstChild as Node, 0);
    expect(breaksTabBlock(range, body)).toBe(false);
  });

  it('never counts hidden tabs or the strip in caret positions, so a caret cannot be put back into them', () => {
    const body = editor(TABS);
    body.dataset.noteEditable = '';
    expect(getLength(body)).toBe('InstallRun it.'.length);
  });

  it('puts a restored caret on an empty line rather than at the end of the line before it', () => {
    const body = editor('<p>Intro</p><p><br></p>');
    body.dataset.noteEditable = '';
    setOffset(body, 5);
    expect(window.getSelection()?.focusNode).toBe(body.lastElementChild);
    setOffset(body, 4);
    expect(window.getSelection()?.focusNode?.textContent).toBe('Intro');
  });

  it('repairs a broken block when saved, and is one block in Block mode', () => {
    expect(cleanHtml('<div class="tab-block"><p>Loose</p><div class="tab-panel" data-title="A"></div><div class="tab-panel is-active is-active"></div></div>'))
      .toBe('<div class="tab-block"><div class="tab-panel" data-title="A"><p><br></p></div><div class="tab-panel is-active"><p><br></p><p>Loose</p></div></div>');
    expect(cleanHtml('<div class="tab-block"><p>No tabs</p></div><p>Kept</p>')).toBe('<p>Kept</p>');
    const blocks = parseBlocks(`<p>a</p>${TABS}`);
    expect(blocks).toHaveLength(2);
    expect(blockType(blocks[1].html)).toBe('tabs');
  });

  it('is offered in the slash menu, but not inside a tab', () => {
    expect(matchCommands('tab', { inlineOnly: false, canAddPage: true })[0].id).toBe('tabs');
    expect(matchCommands('tab block', { inlineOnly: false, canAddPage: true, inTab: true }).some(command => command.id === 'tabs')).toBe(false);
  });
});
