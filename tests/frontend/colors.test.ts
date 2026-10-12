import { describe, expect, it } from 'vitest';
import { applyColor, colorAt, isColorClass } from '../../src/frontend/notespace/editor/colors';
import { cleanHtml } from '../../src/frontend/notespace/sanitize';

/* A note body with the given HTML, and a range over the text from the first "[" to the "]". */
function select(html: string) {
  const body = document.createElement('div');
  body.dataset.noteEditable = '';
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

  /* The range is set after the markers are taken out, because changing a text node moves ranges in it. */
  const range = document.createRange();
  marks.forEach(mark => (mark.open ? range.setStart(mark.text, mark.offset) : range.setEnd(mark.text, mark.offset)));
  return { body, range };
}


/* =========================
   Text Colours
   ========================= */

describe('applyColor', () => {
  it('colours the selected words', () => {
    const { body, range } = select('<p>Some [red] words</p>');
    applyColor(range, 'text', 'red');
    expect(body.innerHTML).toBe('<p>Some <span class="text-red">red</span> words</p>');
  });

  it('colours each line of a selection across lines', () => {
    const { body, range } = select('<p>One [two</p><p>three] four</p>');
    applyColor(range, 'bg', 'yellow');
    expect(body.innerHTML).toBe('<p>One <span class="bg-yellow">two</span></p><p><span class="bg-yellow">three</span> four</p>');
  });

  it('keeps the colour outside a selection that recolours part of a coloured run', () => {
    const { body, range } = select('<p><span class="text-red">ab[cd]ef</span></p>');
    applyColor(range, 'text', 'blue');
    expect(body.innerHTML).toBe('<p><span class="text-red">ab</span><span class="text-blue">cd</span><span class="text-red">ef</span></p>');
  });

  it('takes the colour away, joining what is left, and keeps the other kind of colour', () => {
    const { body, range } = select('<p><span class="bg-green"><span class="text-red">[all]</span></span></p>');
    applyColor(range, 'text', null);
    expect(body.innerHTML).toBe('<p><span class="bg-green">all</span></p>');
  });

  it('tells which colour the selection starts in', () => {
    const { range } = select('<p><span class="bg-pink">[x]</span></p>');
    expect(colorAt(range, 'bg')).toBe('bg-pink');
    expect(colorAt(range, 'text')).toBeNull();
  });
});

describe('stored colours', () => {
  it('keeps only the named colour classes', () => {
    expect(isColorClass('text-red')).toBe(true);
    expect(isColorClass('text-crimson')).toBe(false);
    expect(cleanHtml('<p><span class="text-red bg-blue evil">x</span></p>')).toBe('<p><span class="text-red bg-blue">x</span></p>');
  });
});
