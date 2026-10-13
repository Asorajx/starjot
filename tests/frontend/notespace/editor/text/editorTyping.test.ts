import { describe, expect, it } from 'vitest';
import { getOffset, setOffset } from '../../../../../src/frontend/notespace/editor/text/caret';
import { applyMarkdownShortcut, joinTypedDashes } from '../../../../../src/frontend/notespace/editor/text/markdown';
import { stickyStateForRange, toggleStickyRange } from '../../../../../src/frontend/notespace/editor/text/stickyDom';

/* An editable note body, like the continuous editor, added to the test page. */
function editor(html: string) {
  const body = document.createElement('div');
  body.contentEditable = 'true';
  body.dataset.noteEditable = '';
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

function press(key: string) {
  return new KeyboardEvent('keydown', { key, cancelable: true });
}


/* =========================
   Markdown Shortcuts
   ========================= */

describe('Markdown shortcuts', () => {
  it('turns "#" and Space into a heading', () => {
    const body = editor('<p>#</p>');
    placeCaret(body.querySelector('p')?.firstChild as Node, 1);
    expect(applyMarkdownShortcut(press(' '), body)).toBe(true);
    expect(body.innerHTML).toBe('<h1><br></h1>');
  });

  it('stops at heading level 5', () => {
    const body = editor('<p>######</p>');
    placeCaret(body.querySelector('p')?.firstChild as Node, 6);
    expect(applyMarkdownShortcut(press(' '), body)).toBe(false);
  });

  it('turns a toggle title into a toggle heading, and ignores other shortcuts there', () => {
    const body = editor('<div class="toggle-block is-open"><p class="toggle-summary">###</p><div class="toggle-body"><p><br></p></div></div>');
    placeCaret(body.querySelector('.toggle-summary')?.firstChild as Node, 3);
    expect(applyMarkdownShortcut(press(' '), body)).toBe(true);
    expect(body.querySelector('.toggle-summary')?.outerHTML).toBe('<h3 class="toggle-summary"><br></h3>');

    const list = editor('<div class="toggle-block"><p class="toggle-summary">-</p><div class="toggle-body"></div></div>');
    placeCaret(list.querySelector('.toggle-summary')?.firstChild as Node, 1);
    expect(applyMarkdownShortcut(press(' '), list)).toBe(false);
  });

  it('turns "-" and Space into a bulleted list', () => {
    const body = editor('<p>-</p>');
    placeCaret(body.querySelector('p')?.firstChild as Node, 1);
    applyMarkdownShortcut(press(' '), body);
    expect(body.querySelector('ul li')).not.toBeNull();
  });

  it('turns "```" and Enter into a code block', () => {
    const body = editor('<p>```</p>');
    placeCaret(body.querySelector('p')?.firstChild as Node, 3);
    applyMarkdownShortcut(press('Enter'), body);
    expect(body.querySelector('pre code')).not.toBeNull();
  });

  it('leaves normal text alone', () => {
    const body = editor('<p>hello</p>');
    placeCaret(body.querySelector('p')?.firstChild as Node, 5);
    expect(applyMarkdownShortcut(press(' '), body)).toBe(false);
    expect(body.innerHTML).toBe('<p>hello</p>');
  });
});


/* =========================
   Typed Dashes
   ========================= */

describe('typed dashes', () => {
  const typed = (data: string) => new InputEvent('input', { inputType: 'insertText', data });

  it('joins two hyphens typed in a row into an em dash, with the caret after it', () => {
    const body = editor('<p>word--</p>');
    const text = body.querySelector('p')?.firstChild as Text;
    placeCaret(text, 6);
    let before = '';
    expect(joinTypedDashes(typed('-'), body, () => { before = `${text.data}|${window.getSelection()?.anchorOffset}`; })).toBe(true);
    expect(body.innerHTML).toBe('<p>word—</p>');
    expect(window.getSelection()?.anchorOffset).toBe(5);

    /* The new undo step starts while the caret is still after both hyphens, where Undo puts it back. */
    expect(before).toBe('word--|6');
  });

  it('joins "--" starting a line too, and "---" then Enter still makes a divider', () => {
    const body = editor('<p>--</p>');
    placeCaret(body.querySelector('p')?.firstChild as Node, 2);
    expect(joinTypedDashes(typed('-'), body)).toBe(true);
    expect(body.innerHTML).toBe('<p>—</p>');

    const divider = editor('<p>—-</p>');
    placeCaret(divider.querySelector('p')?.firstChild as Node, 2);
    expect(applyMarkdownShortcut(press('Enter'), divider)).toBe(true);
    expect(divider.querySelector('hr')).not.toBeNull();
  });

  it('leaves code, and other typing, alone', () => {
    const code = editor('<pre><code>a--</code></pre>');
    placeCaret(code.querySelector('code')?.firstChild as Node, 3);
    expect(joinTypedDashes(typed('-'), code)).toBe(false);

    const body = editor('<p>a-b</p>');
    placeCaret(body.querySelector('p')?.firstChild as Node, 3);
    expect(joinTypedDashes(typed('b'), body)).toBe(false);
  });
});


/* =========================
   Caret Positions
   ========================= */

describe('caret positions', () => {
  it('counts characters across lines and puts the caret back in the same place', () => {
    const body = editor('<p>ab</p><p>cd</p>');
    placeCaret(body.querySelectorAll('p')[1].firstChild as Node, 1);
    expect(getOffset(body)).toBe(3);

    placeCaret(body, 0);
    setOffset(body, 3);
    expect(getOffset(body)).toBe(3);
    expect(window.getSelection()?.focusNode?.textContent).toBe('cd');
  });
});


/* =========================
   Sticky Groups (Continuous Notes)
   ========================= */

describe('sticky groups in continuous notes', () => {
  it('sticks the selected lines together, then unsticks them', () => {
    const body = editor('<h2>Title</h2><p>Text</p><p>Other</p>');
    const range = document.createRange();
    range.setStart(body.querySelector('h2')?.firstChild as Node, 1);
    range.setEnd(body.querySelector('p')?.firstChild as Node, 2);

    expect(stickyStateForRange(body, range)).toBe('stick');
    toggleStickyRange(body, range);
    expect(body.innerHTML).toBe('<div class="sticky-group"><h2>Title</h2><p>Text</p></div><p>Other</p>');

    const inside = document.createRange();
    inside.selectNodeContents(body.querySelector('.sticky-group p') as Node);
    expect(stickyStateForRange(body, inside)).toBe('unstick');
    toggleStickyRange(body, inside);
    expect(body.innerHTML).toBe('<h2>Title</h2><p>Text</p><p>Other</p>');
  });
});
