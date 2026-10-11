import { describe, expect, it } from 'vitest';
import { cleanHtml, htmlToText, safeHref } from '../../src/frontend/notespace/sanitize';


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
  it('stores page blocks empty, with only a valid page id and size', () => {
    const html = cleanHtml('<div class="page-block" data-page="note_1" data-size="large" contenteditable="false"><span>Title</span><button>S</button></div>');
    expect(html).toBe('<div class="page-block" data-page="note_1" data-size="large"></div>');
    expect(cleanHtml('<div class="page-block" data-page="bad id!" data-size="huge"></div>')).toBe('<div class="page-block"></div>');
  });

  it('keeps page links, toggle lists and tables', () => {
    const html = '<p>See <a class="page-link" data-page="atlas">Atlas</a></p>'
      + '<div class="toggle-block is-open"><p class="toggle-summary">T</p><div class="toggle-body"><p>A</p></div></div>'
      + '<table><tbody><tr><th>H</th></tr><tr><td>C</td></tr></tbody></table>';
    expect(cleanHtml(html)).toBe(html);
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
