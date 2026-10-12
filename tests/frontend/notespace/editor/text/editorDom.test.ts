import { describe, expect, it } from 'vitest';
import { highlight } from '../../../../../src/frontend/notespace/editor/code/code';
import { markRange, unmark } from '../../../../../src/frontend/notespace/editor/comments/comments';
import { mergeContents } from '../../../../../src/frontend/notespace/editor/text/blockEditing';
import { wrapLooseLines } from '../../../../../src/frontend/notespace/editor/text/dom';

/* These tests build small pieces of page in jsdom and check what the editor helpers do to them. */
function element(html: string) {
  const holder = document.createElement('div');
  holder.dataset.noteEditable = '';
  holder.innerHTML = html;
  document.body.appendChild(holder);
  return holder;
}


/* =========================
   Code Highlighting
   ========================= */

describe('code highlighting', () => {
  it('wraps keywords, strings and numbers in token spans', () => {
    const root = element('<pre><code class="language-javascript">const a = "hi"; let b = 2;</code></pre>');
    highlight(root.querySelector('pre') as HTMLElement);
    const tokens = Array.from(root.querySelectorAll('span')).map(span => `${span.className}:${span.textContent}`);
    expect(tokens).toEqual(['tok-keyword:const', 'tok-string:"hi"', 'tok-keyword:let', 'tok-number:2']);
  });

  it('leaves plain text code without tokens', () => {
    const root = element('<pre><code>const a = 1;</code></pre>');
    highlight(root.querySelector('pre') as HTMLElement);
    expect(root.querySelectorAll('span')).toHaveLength(0);
  });
});


/* =========================
   Comments, Merging and Loose Text
   ========================= */

describe('comment marks', () => {
  it('marks the selected words and removes the mark again', () => {
    const root = element('<p>hello world</p>');
    const text = root.querySelector('p')?.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 6);
    range.setEnd(text, 11);

    expect(markRange(range, 'c1')).toBe(true);
    expect(root.innerHTML).toBe('<p>hello <span class="comment-mark" data-comment="c1">world</span></p>');
    unmark(root, 'c1');
    expect(root.textContent).toBe('hello world');
    expect(root.querySelector('.comment-mark')).toBeNull();
  });
});

describe('mergeContents', () => {
  it('joins the last line of one block with the first line of the next', () => {
    const upper = element('<p>Hello </p>');
    const lower = element('<p>world</p>');
    const merged = mergeContents(upper, lower);
    expect(merged.html).toBe('<p>Hello world</p>');
    expect(merged.offset).toBe(6);
  });

  it('joins text into a toggle above: its last line when open, its title when closed', () => {
    const open = element('<div class="toggle-block is-open"><p class="toggle-summary">T</p><div class="toggle-body"><p>A</p></div></div>');
    expect(mergeContents(open, element('<p>B</p>')).html)
      .toBe('<div class="toggle-block is-open"><p class="toggle-summary">T</p><div class="toggle-body"><p>AB</p></div></div>');
    const closed = element('<div class="toggle-block"><p class="toggle-summary">T</p><div class="toggle-body"><p>A</p></div></div>');
    expect(mergeContents(closed, element('<p>B</p>')).html)
      .toBe('<div class="toggle-block"><p class="toggle-summary">TB</p><div class="toggle-body"><p>A</p></div></div>');
  });
});

describe('wrapLooseLines', () => {
  it('puts loose text into a paragraph so the first line is styled like the rest', () => {
    const root = element('first line<p>second</p>');
    wrapLooseLines(root);
    expect(root.innerHTML).toBe('<p>first line</p><p>second</p>');
  });
});
