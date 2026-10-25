import { describe, expect, it } from 'vitest';
import { cleanHtml, htmlToText, safeHref } from '../../../src/frontend/notespace/sanitize';


/* =========================
   Safe Document HTML
   ========================= */

describe('cleanHtml', () => {
  it('removes scripts and unknown attributes', () => {
    const html = cleanHtml('<p onclick="alert(1)" style="color:red">Hi<script>alert(1)</script></p>');
    expect(html).toBe('<p>Hi</p>');
  });

  it('unwraps unknown tags but keeps their text', () => {
    expect(cleanHtml('<p><font>kept</font></p>')).toBe('<p>kept</p>');
  });

  it('keeps sticky groups, code languages and comment marks', () => {
    const html = '<div class="sticky-group"><pre><code class="language-python">x</code></pre></div>'
      + '<p><span class="comment-mark" data-comment="c123">note</span></p>';
    expect(cleanHtml(html)).toBe(html);
  });

  it('gives a toggle back a title or body it lost', () => {
    expect(cleanHtml('<div class="toggle-block is-open"><p class="toggle-summary">T</p></div>'))
      .toBe('<div class="toggle-block is-open"><p class="toggle-summary">T</p><div class="toggle-body"></div></div>');
  });

  it('drops links that could run script', () => {
    expect(cleanHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(cleanHtml('<a href="https://example.com">x</a>')).toBe('<a href="https://example.com">x</a>');
  });

  it('removes the line breaks stored between blocks', () => {
    expect(cleanHtml('<p>a</p>\n  <p>b</p>')).toBe('<p>a</p><p>b</p>');
  });

  it('removes empty sticky groups', () => {
    expect(cleanHtml('<div class="sticky-group"></div><p>x</p>')).toBe('<p>x</p>');
  });
});

describe('page blocks, toggles and tables', () => {
  it('stores page blocks empty, with only a valid page id, size and width', () => {
    const html = cleanHtml('<p>See <span class="page-block" data-page="note_1" data-size="large" contenteditable="false"><span>Title</span><button>S</button></span> here</p>');
    expect(html).toBe('<p>See <span class="page-block" data-page="note_1" data-size="large"></span> here</p>');
    expect(cleanHtml('<p><span class="page-block" data-page="bad id!" data-size="huge"></span></p>')).toBe('<p><span class="page-block"></span></p>');
    expect(cleanHtml('<p><span class="page-block" data-page="a" data-width="40" style="width: 40%"></span></p>')).toBe('<p><span class="page-block" data-page="a" data-width="40"></span></p>');
    expect(cleanHtml('<p><span class="page-block" data-page="a" data-width="5"></span></p>')).toBe('<p><span class="page-block" data-page="a"></span></p>');
  });

  it('turns an older page block line into a line holding the new inline block', () => {
    expect(cleanHtml('<div class="page-block" data-page="a" data-size="medium"></div><p>Next</p>'))
      .toBe('<p><span class="page-block" data-page="a" data-size="medium"></span></p><p>Next</p>');
  });

  it('keeps page links, toggle lists and tables', () => {
    const html = '<p>See <a class="page-link" data-page="atlas">Atlas</a></p>'
      + '<div class="toggle-block is-open"><p class="toggle-summary">T</p><div class="toggle-body"><p>A</p></div></div>'
      + '<table><tbody><tr><th>H</th></tr><tr><td>C</td></tr></tbody></table>';
    expect(cleanHtml(html)).toBe(html);
  });
});

describe('table options', () => {
  it('keeps how far merged table cells stretch, within sensible limits', () => {
    const html = cleanHtml('<table><tbody><tr><td colspan="2" rowspan="3">A</td><td colspan="1" rowspan="500">B</td></tr></tbody></table>');
    expect(html).toBe('<table><tbody><tr><td colspan="2" rowspan="3">A</td><td>B</td></tr></tbody></table>');
  });

  it('keeps stored table column widths and row heights, but not inline styles', () => {
    const html = cleanHtml('<table style="width:9px"><colgroup><col data-width="120" style="width:120px"><col data-width="9"></colgroup><tbody><tr data-height="60" style="height:60px"><td>A</td><td>B</td></tr></tbody></table>');
    expect(html).toBe('<table><colgroup><col data-width="120"><col></colgroup><tbody><tr data-height="60"><td>A</td><td>B</td></tr></tbody></table>');
  });

  it('keeps toggle headings', () => {
    const html = '<div class="toggle-block"><h4 class="toggle-summary">T</h4><div class="toggle-body"><p>A</p></div></div>';
    expect(cleanHtml(html)).toBe(html);
  });

  it('keeps a table comment and the fit-content option, but not other classes', () => {
    const html = cleanHtml('<table class="fit-content wide" data-comment="cabc1" style="color:red"><tbody><tr><td>A</td></tr></tbody></table>');
    expect(html).toBe('<table class="fit-content" data-comment="cabc1"><tbody><tr><td>A</td></tr></tbody></table>');
  });
});

describe('canvas text boxes', () => {
  it('keeps a box with its id, place and width, and repairs broken values', () => {
    expect(cleanHtml('<div class="canvas-box" data-box="b1" data-x="12.34" data-y="-40" data-width="300"><p>Hi</p></div>'))
      .toBe('<div class="canvas-box" data-box="b1" data-x="12.3" data-y="-40" data-width="300"><p>Hi</p></div>');
    expect(cleanHtml('<div class="canvas-box" data-box="b2" data-x="x" data-y="1e99" data-width="5"></div>'))
      .toBe('<div class="canvas-box" data-box="b2" data-x="0" data-y="1000000" data-width="80"><p><br></p></div>');
  });

  it('unwraps a box inside another box, or one without a valid id, keeping its lines', () => {
    expect(cleanHtml('<div class="canvas-box" data-box="b1" data-x="0" data-y="0" data-width="320"><div class="canvas-box" data-box="b2"><p>Inner</p></div></div>'))
      .toBe('<div class="canvas-box" data-box="b1" data-x="0" data-y="0" data-width="320"><p>Inner</p></div>');
    expect(cleanHtml('<div class="canvas-box" data-box="bad id"><p>Kept</p></div>')).toBe('<p>Kept</p>');
  });
});

describe('htmlToText', () => {
  it('puts a space between lines and table cells', () => {
    expect(htmlToText('<p>One</p><p>Two</p><table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>').trim()).toBe('One Two A B');
  });
});

describe('safeHref', () => {
  it('allows web and email links only', () => {
    expect(safeHref('https://example.com')).toBe('https://example.com');
    expect(safeHref('mailto:me@example.com')).toBe('mailto:me@example.com');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,hi')).toBeNull();
  });
});


/* =========================
   Long Notes
   ========================= */

describe('long notes', () => {
  it('keeps the end of a note far past the old 250,000 character limit', () => {
    const paragraph = `<p>${'word '.repeat(40)}</p>`;
    const html = paragraph.repeat(Math.ceil(400000 / paragraph.length)) + '<p>END_MARKER</p>';
    expect(html.length).toBeGreaterThan(400000);
    const cleaned = cleanHtml(html);
    expect(cleaned.endsWith('<p>END_MARKER</p>')).toBe(true);
    expect(cleaned.length).toBe(html.length);
  });
});
