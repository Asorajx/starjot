import { describe, expect, it } from 'vitest';
import { findMatches, replaceAll, replaceMatch } from '../../../../../src/frontend/notespace/editor/find/find';

function note(html: string) {
  const body = document.createElement('div');
  body.innerHTML = html;
  document.body.replaceChildren(body);
  return body;
}


/* =========================
   Finding
   ========================= */

describe('finding words in a note', () => {
  it('finds every match, ignoring case unless asked', () => {
    const body = note('<p>Cat and cat and CAT</p>');
    expect(findMatches(body, 'cat', false).map(range => range.toString())).toEqual(['Cat', 'cat', 'CAT']);
    expect(findMatches(body, 'cat', true)).toHaveLength(1);
  });

  it('finds words split across formatting, but not across lines', () => {
    const body = note('<p>bo<strong>ld</strong> end</p><p>start</p>');
    expect(findMatches(body, 'bold', false).map(range => range.toString())).toEqual(['bold']);
    expect(findMatches(body, 'endstart', false)).toHaveLength(0);
    expect(findMatches(body, 'end start', false)).toHaveLength(0);
  });

  it('leaves out titles drawn into sub-note cards', () => {
    const body = note('<p>Plan <span class="page-block" contenteditable="false">Plan B</span></p>');
    expect(findMatches(body, 'plan', false)).toHaveLength(1);
  });

  it('searches only the selected part when given one', () => {
    const body = note('<p>one</p><p>one two</p><p>one</p>');
    const within = document.createRange();
    within.selectNodeContents(body.children[1]);
    expect(findMatches(body, 'one', false, within)).toHaveLength(1);
  });
});


/* =========================
   Replacing
   ========================= */

describe('replacing words in a note', () => {
  it('replaces one match', () => {
    const body = note('<p>red and red</p>');
    replaceMatch(findMatches(body, 'red', false)[1], 'blue');
    expect(body.textContent).toBe('red and blue');
  });

  it('replaces every match, also across formatting', () => {
    const body = note('<p>re<em>d</em> and red</p>');
    replaceAll(findMatches(body, 'red', false), 'green');
    expect(body.textContent).toBe('green and green');
  });
});
