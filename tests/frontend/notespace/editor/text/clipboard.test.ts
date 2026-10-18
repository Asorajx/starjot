import { describe, expect, it } from 'vitest';
import { pastedLines, selectionHtml, writeClipboard } from '../../../../../src/frontend/notespace/editor/text/clipboard';
import { markdownOf } from '../../../../../src/frontend/notespace/export/exportMarkdown';
import { pastedMarkdown } from '../../../../../src/frontend/notespace/editor/text/paste';

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


/* =========================
   Copying Blocks Exactly
   ========================= */

/* A clipboard as a copy and a paste would see it. */
function clipboard() {
  const store = new Map<string, string>();
  return {
    setData: (type: string, value: string) => store.set(type, value),
    getData: (type: string) => store.get(type) ?? ''
  } as unknown as DataTransfer;
}

describe('copying toggle lists and tab blocks', () => {
  it('pastes them back exactly, with the lines around them, even inside a quote', () => {
    const toggle = '<div class="toggle-block"><h3 class="toggle-summary">Details</h3><div class="toggle-body"><p>Inside</p></div></div>';
    const tabs = '<div class="tab-block"><div class="tab-panel" data-title="A"><p>One</p></div><div class="tab-panel is-active" data-title="B"><p>Two</p></div></div>';
    const data = clipboard();
    writeClipboard(data, `<p>Before</p>${toggle}${tabs}<blockquote>${toggle}</blockquote>`, 'Before…');
    expect(data.getData('text/x-starjot-markdown')).not.toContain('<details>');
    expect(pastedLines(data)?.map(line => line.outerHTML)).toEqual(['<p>Before</p>', toggle, tabs, `<blockquote>${toggle}</blockquote>`]);
  });

  it('copies the toggle itself when its whole title and lines are selected', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="toggle-block is-open"><h2 class="toggle-summary">Title</h2><div class="toggle-body"><p>Body</p></div></div>';
    const range = document.createRange();
    range.setStart(root.querySelector('h2')?.firstChild as Node, 0);
    range.setEnd(root.querySelector('.toggle-body p')?.firstChild as Node, 4);
    expect(selectionHtml(range, root)).toBe(root.innerHTML);

    /* Selecting the toggle's contents (as Ctrl + A does) copies it once, not wrapped twice. */
    range.selectNodeContents(root.querySelector('.toggle-block') as Node);
    expect(selectionHtml(range, root)).toBe(root.innerHTML);
  });

  it('pastes a toggle on its own as a toggle, not as plain text', () => {
    const toggle = '<div class="toggle-block is-open"><p class="toggle-summary">Title</p><div class="toggle-body"><p>Body</p></div></div>';
    const data = clipboard();
    writeClipboard(data, toggle, 'Title Body');
    expect(pastedLines(data)?.map(line => line.outerHTML)).toEqual([toggle]);
  });
});
