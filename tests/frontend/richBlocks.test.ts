import { describe, expect, it } from 'vitest';
import { convertLine, createPageBlock, hydratePages, insertBlock } from '../../src/frontend/notespace/editor/blocks';
import { EditorSession } from '../../src/frontend/notespace/editor/session';
import { getNote } from '../../src/frontend/notespace/store';

/* A container for test content, added to the test page so the caret and layout helpers can work. */
/* The note store (with its sample notes) stays loaded for the whole file, so tests compare counts */
/* with what was there before rather than with fixed numbers. */
function holder(html: string) {
  const element = document.createElement('div');
  element.innerHTML = html;
  document.body.replaceChildren(element);
  return element;
}


/* =========================
   Drawing Page Blocks
   ========================= */

describe('page blocks', () => {
  it('shows the title of the page they point to, and their saved width', () => {
    const line = holder('<p>See </p>');
    const block = createPageBlock('atlas');
    block.dataset.width = '40';
    line.querySelector('p')?.appendChild(block);
    hydratePages(line);

    expect(block.querySelector('strong')?.textContent).toBe('Project Atlas — Research brief');
    expect(block.contentEditable).toBe('false');
    expect(block.style.width).toBe('40%');
    expect(block.querySelectorAll('[data-size-option]')).toHaveLength(3);
  });

  it('shows "Page not found" when the page was deleted', () => {
    const line = holder('<p><span class="page-block" data-page="gone"></span></p>');
    hydratePages(line);
    const block = line.querySelector('.page-block') as HTMLElement;
    expect(block.classList.contains('is-missing')).toBe(true);
    expect(block.querySelector('strong')?.textContent).toBe('Page not found');
  });

  it('does not redraw a block that has not changed', () => {
    const line = holder('<p><span class="page-block" data-page="atlas"></span></p>');
    hydratePages(line);
    const title = line.querySelector('strong');
    hydratePages(line);
    expect(line.querySelector('strong')).toBe(title);
  });
});


/* =========================
   More Slash Command Lines
   ========================= */

describe('more slash command lines', () => {
  it('turns a line into a code block as plain text', () => {
    const body = holder('<p>let <strong>x</strong> = 1</p>');
    const change = convertLine(body.querySelector('p') as HTMLElement, 'code');
    expect(body.querySelector('pre code')?.textContent).toBe('let x = 1');
    expect(change.focus.tagName).toBe('CODE');
  });

  it('adds a divider after a list item by splitting the list around it', () => {
    const body = holder('<ul><li>One</li><li>Two</li></ul>');
    insertBlock(body.querySelector('li') as HTMLElement, document.createElement('hr'));
    expect(body.innerHTML).toBe('<ul><li>One</li></ul><hr><p><br></p><ul><li>Two</li></ul>');
  });
});


/* =========================
   Table Comments
   ========================= */

describe('table comments', () => {
  it('marks the whole table and stores the comment with the note', () => {
    const body = holder('<table><tbody><tr><td>A</td></tr></tbody></table>');
    const session = new EditorSession('atlas', body.innerHTML);
    const before = getNote('atlas')?.comments.length ?? 0;
    const table = body.querySelector('table') as HTMLElement;

    session.addComment(table, '  Check the totals  ');
    const comments = getNote('atlas')?.comments ?? [];
    expect(comments).toHaveLength(before + 1);
    expect(comments[comments.length - 1].text).toBe('Check the totals');
    expect(table.dataset.comment).toBe(comments[comments.length - 1].id);
  });

  it('ignores an empty comment', () => {
    const body = holder('<table><tbody><tr><td>A</td></tr></tbody></table>');
    const session = new EditorSession('atlas', body.innerHTML);
    const table = body.querySelector('table') as HTMLElement;
    session.addComment(table, '   ');
    expect(table.hasAttribute('data-comment')).toBe(false);
  });
});
