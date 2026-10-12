import { describe, expect, it } from 'vitest';
import { selectionHtml } from '../../src/frontend/notespace/editor/clipboard';
import { markdownOf } from '../../src/frontend/notespace/export/exportMarkdown';
import { pastedMarkdown } from '../../src/frontend/notespace/editor/paste';

/* The Markdown copied for a selection from the first to the last given element's text. */
function copied(html: string, from: string, to = from, partial = false) {
  const root = document.createElement('div');
  root.innerHTML = html;
  const start = root.querySelector(from)?.firstChild as Text;
  const end = root.querySelector(to)?.firstChild as Text;
  const range = document.createRange();
  range.setStart(start, partial ? 1 : 0);
  range.setEnd(end, end.length);
  const holder = document.createElement('div');
  holder.innerHTML = selectionHtml(range, root);
  return markdownOf(holder);
}


/* =========================
   Copying From a Note
   ========================= */

describe('copying from a note', () => {
  it('keeps the kind of a whole line', () => {
    expect(copied('<h2>Goals</h2><p>Text</p>', 'h2')).toBe('## Goals');
    expect(copied('<ul><li>one</li><li>two</li></ul>', 'li')).toBe('- one');
  });

  it('copies part of a line as text', () => {
    expect(copied('<h2>Goals</h2>', 'h2', 'h2', true)).toBe('oals');
  });

  it('keeps every line of a selection across lines, with formatting', () => {
    expect(copied('<h2>Goals</h2><p>Some <strong>bold</strong> text</p>', 'h2', 'p')).toBe('## Goals\n\nSome');
  });

  it('pastes the copied Markdown back as the same kind of line', () => {
    expect(pastedMarkdown('## Goals')?.map(line => line.outerHTML)).toEqual(['<h2>Goals</h2>']);
  });
});
