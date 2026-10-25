import { describe, expect, it } from 'vitest';
import { changeLinesType, linesInRange, typeOfLine, type LineType } from '../../../../../src/frontend/notespace/editor/format/lineTypes';

/* A note body with the given HTML, and a range over the text from the first "[" to the "]". */
function select(html: string) {
  const body = document.createElement('div');
  body.innerHTML = html;
  const marks: { text: Text; offset: number; open: boolean }[] = [];
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    const open = text.data.indexOf('[');
    const close = text.data.indexOf(']');
    text.data = text.data.replace('[', '').replace(']', '');
    if (open >= 0) marks.push({ text, offset: open, open: true });
    if (close >= 0) marks.push({ text, offset: open >= 0 && open < close ? close - 1 : close, open: false });
  }
  const range = document.createRange();
  marks.forEach(mark => (mark.open ? range.setStart(mark.text, mark.offset) : range.setEnd(mark.text, mark.offset)));
  return { body, range };
}

/* Change the selected lines and return the body's HTML. */
function change(html: string, type: LineType) {
  const { body, range } = select(html);
  const lines = linesInRange(range, body);
  if (!lines) throw new Error('nothing to change');
  changeLinesType(lines, type, body);
  return body.innerHTML;
}


/* =========================
   Finding Lines
   ========================= */

describe('lines in a selection', () => {
  it('finds each selected line once, in order', () => {
    const { body, range } = select('<p>o[ne</p><h2>two</h2><ul><li>three]</li><li>four</li></ul>');
    expect(linesInRange(range, body)?.map(line => line.textContent)).toEqual(['one', 'two', 'three']);
  });

  it('leaves out a line the selection only touches at its very start', () => {
    const { body, range } = select('<p>[one</p><p>]two</p>');
    expect(linesInRange(range, body)?.map(line => line.textContent)).toEqual(['one']);
  });

  it('leaves out a bullet when only its sub-bullet is selected', () => {
    const { body, range } = select('<ul><li>parent<ul><li>[child]</li></ul></li></ul>');
    expect(linesInRange(range, body)?.map(line => line.firstChild?.textContent)).toEqual(['child']);
  });

  it('refuses table cells and toggle titles', () => {
    const table = select('<table><tbody><tr><td>[cell]</td></tr></tbody></table>');
    expect(linesInRange(table.range, table.body)).toBeNull();
    const toggle = select('<div class="toggle-block"><p class="toggle-summary">[title]</p><div class="toggle-body"><p>x</p></div></div>');
    expect(linesInRange(toggle.range, toggle.body)).toBeNull();
  });

  it('refuses a selection across two blocks in Block mode', () => {
    const { body, range } = select('<div class="block-content"><p>[one</p></div><div class="block-content"><p>two]</p></div>');
    expect(linesInRange(range, body)).toBeNull();
  });

  it('names each line\'s type', () => {
    const { body } = select('<p>a</p><blockquote><p>b</p></blockquote><ol><li>c</li></ol><ul class="checklist"><li>d</li></ul><pre><code>e</code></pre>');
    expect(Array.from(body.querySelectorAll(':scope > p, blockquote > p, li, pre')).map(typeOfLine)).toEqual(['text', 'quote', 'numbered', 'checklist', 'code']);
  });
});


/* =========================
   Changing Lines
   ========================= */

describe('changing the type of lines', () => {
  it('turns text into a heading and back, keeping bold words', () => {
    expect(change('<p>[some <strong>bold</strong> words]</p>', 'h2')).toBe('<h2>some <strong>bold</strong> words</h2>');
    expect(change('<h2>[title]</h2>', 'text')).toBe('<p>title</p>');
  });

  it('turns several lines into one list', () => {
    expect(change('<p>[one</p><p>two]</p>', 'bullet')).toBe('<ul><li>one</li><li>two</li></ul>');
  });

  it('turns the middle of a list into text, splitting the list around it', () => {
    expect(change('<ul><li>one</li><li>[two]</li><li>three</li></ul>', 'text')).toBe('<ul><li>one</li></ul><p>two</p><ul><li>three</li></ul>');
  });

  it('turns bullets into numbers, sub-bullets included when they are selected too', () => {
    expect(change('<ul><li>[one<ul><li>sub</li></ul></li><li>two]</li></ul>', 'numbered'))
      .toBe('<ol><li>one<ol><li>sub</li></ol></li><li>two</li></ol>');
  });

  it('moves a bullet\'s sub-bullets out below it when it becomes a heading', () => {
    expect(change('<ul><li>[one]<ul><li>sub</li></ul></li></ul>', 'h3')).toBe('<h3>one</h3><ul><li>sub</li></ul>');
  });

  it('makes one quote from several lines, and takes a line back out of a quote', () => {
    expect(change('<p>[one</p><p>two]</p>', 'quote')).toBe('<blockquote><p>one</p><p>two</p></blockquote>');
    expect(change('<blockquote><p>one</p><p>[two]</p></blockquote>', 'text')).toBe('<blockquote><p>one</p></blockquote><p>two</p>');
  });

  it('joins lines into one code block, and splits a code block back into lines', () => {
    const code = change('<p>[let a = 1;</p><p>a += 1;]</p>', 'code');
    expect(code.startsWith('<pre')).toBe(true);
    const { body } = select(code);
    expect(body.querySelector('pre')?.textContent).toBe('let a = 1;\na += 1;');
    expect(change('<pre><code>[one\ntwo]</code></pre>', 'text')).toBe('<p>one</p><p>two</p>');
  });

  it('leaves lines already of that type alone', () => {
    expect(change('<h2>[same]</h2>', 'h2')).toBe('<h2>same</h2>');
  });

  it('keeps a bullet\'s unselected sub-bullets as they are when it becomes a number', () => {
    expect(change('<ul><li>[one]<ul><li>sub</li></ul></li></ul>', 'numbered')).toBe('<ol><li>one<ul><li>sub</li></ul></li></ol>');
  });
});
