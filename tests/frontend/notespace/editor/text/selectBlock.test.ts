import { describe, expect, it } from 'vitest';
import { selectBlockText } from '../../../../../src/frontend/notespace/editor/text/selectBlock';

/* An editable note body, like the continuous editor, with the caret in the first text of selector. */
function editorWithCaret(html: string, selector: string) {
  const body = document.createElement('div');
  body.contentEditable = 'true';
  body.innerHTML = html;
  document.body.replaceChildren(body);
  const walker = document.createTreeWalker(body.querySelector(selector) as Node, NodeFilter.SHOW_TEXT);
  const text = walker.nextNode() as Text;
  const range = document.createRange();
  range.setStart(text, 1);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
  return body;
}


/* =========================
   Ctrl + A in Blocks
   ========================= */

describe('Ctrl + A in a block', () => {
  const cases: [string, string, string, string][] = [
    ['code block', '<p>Before</p><pre><code>let a = 1;\nlet b = 2;</code></pre>', 'pre', 'let a = 1;\nlet b = 2;'],
    ['toggle list', '<p>Before</p><div class="toggle-block is-open"><p class="toggle-summary">Title</p><div class="toggle-body"><p>Inside</p></div></div>', '.toggle-body p', 'TitleInside'],
    ['quote', '<p>Before</p><blockquote><p>One</p><p>Two</p></blockquote>', 'blockquote', 'OneTwo'],
    ['list', '<p>Before</p><ul><li>One</li><li>Two</li></ul>', 'li', 'OneTwo'],
    ['table cell', '<table><tbody><tr><td>Cell</td><td>Next</td></tr></tbody></table>', 'td', 'Cell'],
    ['tab', '<div class="tab-block"><div class="tab-panel is-active"><p>Shown</p></div><div class="tab-panel"><p>Hidden</p></div></div>', '.tab-panel p', 'Shown']
  ];

  it.each(cases)('selects just the %s first, then leaves the whole note to the next press', (_name, html, selector, selected) => {
    const body = editorWithCaret(html, selector);
    expect(selectBlockText(body)).toBe('block');
    expect(window.getSelection()?.toString()).toBe(selected);
    expect(selectBlockText(body)).toBe('note');
  });

  it('leaves a plain line to the usual Ctrl + A', () => {
    const body = editorWithCaret('<p>Just text</p>', 'p');
    expect(selectBlockText(body)).toBeNull();
  });
});
