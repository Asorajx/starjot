import { describe, expect, it } from 'vitest';
import { convertLine, createPageBlock, insertBlock } from '../../../../../src/frontend/notespace/editor/text/lines';
import { deleteKeepingPages, hydratePages, removePageBlocks, stepOverPage } from '../../../../../src/frontend/notespace/editor/text/pageBlocks';
import { handleBlockKeys, typeOutsideComment } from '../../../../../src/frontend/notespace/editor/text/blockKeys';
import { EditorSession } from '../../../../../src/frontend/notespace/editor/session';
import { createNote, createSubpage, getNote, separatePage } from '../../../../../src/frontend/notespace/store';

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

  it('shows "Note not found" when the note was deleted', () => {
    const line = holder('<p><span class="page-block" data-page="gone"></span></p>');
    hydratePages(line);
    const block = line.querySelector('.page-block') as HTMLElement;
    expect(block.classList.contains('is-missing')).toBe(true);
    expect(block.querySelector('strong')?.textContent).toBe('Note not found');
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


/* =========================
   Protecting Page Blocks
   ========================= */

/* What a line holds, with each page block shown as [PAGE]. */
function text(root: Element) {
  return Array.from(root.querySelectorAll('p')).map(line => Array.from(line.childNodes)
    .map(node => ((node as Element).classList?.contains('page-block') ? '[PAGE]' : node.textContent)).join(''));
}

/* A fake Backspace or Delete, as the browser describes it before deleting: what it is about to remove. */
function deletion(inputType: string, start: [Node, number], end: [Node, number]) {
  return { inputType, getTargetRanges: () => [{ startContainer: start[0], startOffset: start[1], endContainer: end[0], endOffset: end[1] }] } as unknown as InputEvent;
}

describe('protecting page blocks', () => {
  it('keeps page blocks when a selection across lines is deleted', () => {
    const body = holder('<p>One</p><p>Two <span class="page-block" data-page="atlas"></span> three</p><p>Four</p>');
    const range = document.createRange();
    range.setStart(body.querySelector('p')?.firstChild as Node, 1);
    range.setEnd(body.querySelectorAll('p')[2].firstChild as Node, 2);
    expect(deleteKeepingPages(range, body)).toBe(true);
    expect(text(body)).toEqual(['O[PAGE] ur']);
  });

  it('puts typed text before the kept page blocks', () => {
    const body = holder('<p>Say <span class="page-block" data-page="atlas"></span> bye</p>');
    const range = document.createRange();
    range.selectNodeContents(body.querySelector('p') as Node);
    deleteKeepingPages(range, body, 'Hi');
    expect(text(body)).toEqual(['Hi[PAGE] ']);
  });

  it('does nothing for a selection without page blocks', () => {
    const body = holder('<p>Plain text</p>');
    const range = document.createRange();
    range.selectNodeContents(body.querySelector('p') as Node);
    expect(deleteKeepingPages(range, body)).toBe(false);
    expect(text(body)).toEqual(['Plain text']);
  });

  it('steps over a page block instead of deleting it', () => {
    const body = holder('<p>A<span class="page-block" data-page="atlas"></span>B</p>');
    const line = body.querySelector('p') as HTMLElement;
    const caret = document.createRange();
    caret.setStart(line, 2);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(caret);

    expect(stepOverPage(deletion('deleteContentBackward', [line, 1], [line, 2]), body)).toBe(true);
    const after = window.getSelection()?.getRangeAt(0);
    expect([after?.startContainer, after?.startOffset]).toEqual([line, 1]);
    expect(text(body)).toEqual(['A[PAGE]B']);
    expect(stepOverPage(deletion('deleteContentBackward', [line.firstChild as Node, 0], [line.firstChild as Node, 1]), body)).toBe(false);
  });

  it('removes every block for a page, with the space after it', () => {
    const body = holder('<p>A <span class="page-block" data-page="gone"></span> B</p>');
    removePageBlocks(body, 'gone');
    expect(text(body)).toEqual(['A B']);
  });

  it('moves a separated page up one level, keeping its own sub-pages', () => {
    const top = createNote();
    const child = createSubpage(top.id)!;
    separatePage(child.id);
    expect(getNote(child.id)?.parentId).toBe('');
    separatePage(top.id);
    expect(getNote(top.id)?.parentId).toBe('');
  });
});


/* =========================
   Comments
   ========================= */

function caretAt(node: Node, offset: number) {
  const range = document.createRange();
  range.setStart(node, offset);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
}

describe('comments', () => {
  it('undoes deleting a comment, bringing back its text', () => {
    const body = holder('<p>Alpha beta</p>');
    body.className = 'note-body';
    body.dataset.noteEditable = '';
    const session = new EditorSession('weekly', body.innerHTML);
    session.setBody(body);
    session.setAdapter({ commit: () => session.save(body.innerHTML), toggleSticky: () => undefined, selectAll: () => undefined, linesChanged: () => undefined });
    const range = document.createRange();
    range.selectNodeContents(body.querySelector('p') as Node);
    session.addComment(range, 'Look again');
    const id = getNote('weekly')?.comments.at(-1)?.id as string;

    session.removeComment(id);
    expect(getNote('weekly')?.comments.some(comment => comment.id === id)).toBe(false);
    session.undo();
    expect(getNote('weekly')?.comments.find(comment => comment.id === id)?.text).toBe('Look again');
    expect(getNote('weekly')?.content).toContain(`data-comment="${id}"`);
    session.undo();
    expect(getNote('weekly')?.comments.some(comment => comment.id === id)).toBe(false);
  });

  it('types outside a comment at its start or end, but inside it in the middle', () => {
    const body = holder('<p>A <span class="comment-mark" data-comment="c1">word</span></p>');
    const mark = body.querySelector('.comment-mark') as HTMLElement;
    const typed = (data: string) => ({ inputType: 'insertText', data }) as InputEvent;

    caretAt(mark.firstChild as Node, 4);
    expect(typeOutsideComment(typed('s'))).toBe(true);
    caretAt(mark.firstChild as Node, 0);
    expect(typeOutsideComment(typed('!'))).toBe(true);
    caretAt(mark.firstChild as Node, 2);
    expect(typeOutsideComment(typed('x'))).toBe(false);
    expect(body.innerHTML).toBe('<p>A !<span class="comment-mark" data-comment="c1">word</span>s</p>');
  });

  it('moves the caret out of a comment before Enter at its end', () => {
    const body = holder('<p>A <span class="comment-mark" data-comment="c1">word</span></p>');
    const mark = body.querySelector('.comment-mark') as HTMLElement;
    caretAt(mark.firstChild as Node, 4);
    handleBlockKeys(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }), body);
    const caret = window.getSelection()?.getRangeAt(0);
    expect(mark.contains(caret?.startContainer as Node)).toBe(false);
  });
});
