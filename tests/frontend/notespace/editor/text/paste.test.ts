import { describe, expect, it } from 'vitest';
import { getOffset } from '../../../../../src/frontend/notespace/editor/text/caret';
import { insertPasted, linkSelectionToPasted, pastedMarkdown } from '../../../../../src/frontend/notespace/editor/text/paste';

/* The HTML a paste would insert, or null when the text is pasted as plain text. */
function markdown(text: string, html = '') {
  const lines = pastedMarkdown(text, html);
  return lines ? lines.map(line => line.outerHTML).join('') : null;
}

/* An editable note body, like the continuous editor, with the caret where "|" is written. */
function editor(html: string) {
  const body = document.createElement('div');
  body.contentEditable = 'true';
  body.dataset.noteEditable = '';
  body.innerHTML = html.replace('|', '<span id="caret"></span>');
  document.body.replaceChildren(body);

  const mark = body.querySelector('#caret') as Element;
  const range = document.createRange();
  range.setStartBefore(mark);
  range.collapse(true);
  mark.remove();
  range.startContainer.normalize();
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
  return body;
}

function paste(body: HTMLElement, text: string) {
  return insertPasted(body, pastedMarkdown(text) as HTMLElement[]);
}


/* =========================
   Reading Pasted Markdown
   ========================= */

describe('pastedMarkdown', () => {
  it('leaves text without Markdown as plain text', () => {
    expect(markdown('Just words\n\nand more words')).toBeNull();
    expect(markdown('2 * 3 * 4 and file_name_here')).toBeNull();
  });

  it('turns Markdown links into links with those words', () => {
    expect(markdown('[Click here to open Google](https://google.com/)'))
      .toBe('<p><a href="https://google.com/">Click here to open Google</a></p>');
    expect(markdown('See [Rust](https://en.wikipedia.org/wiki/Rust_(programming_language)).'))
      .toBe('<p>See <a href="https://en.wikipedia.org/wiki/Rust_(programming_language)">Rust</a>.</p>');
    expect(markdown('[site](example.com)')).toBe('<p><a href="https://example.com">site</a></p>');
  });

  it('turns web addresses written in the text into links, leaving punctuation after them', () => {
    expect(markdown('Go to https://google.com/search?q=x now.'))
      .toBe('<p>Go to <a href="https://google.com/search?q=x">https://google.com/search?q=x</a> now.</p>');
    expect(markdown('www.example.org.')).toBe('<p><a href="https://www.example.org">www.example.org</a>.</p>');
  });

  it('turns a page address into a link to that page, named after it', () => {
    expect(markdown('http://localhost:5173/#note=welcome')).toBe('<p><a class="page-link" data-page="welcome">Welcome to Starjot</a></p>');
    expect(markdown('[the brief](http://localhost:5173/#note=welcome)')).toBe('<p><a class="page-link" data-page="welcome">the brief</a></p>');
  });

  it('keeps links that could run script as plain text', () => {
    expect(markdown('[x](javascript:alert(1))')).toBeNull();
    expect(markdown('[x](javascript:alert(1)) and **bold**')).toBe('<p>[x](javascript:alert(1)) and <strong>bold</strong></p>');
  });

  it('formats bold, italic, strikethrough and code', () => {
    expect(markdown('**bold** *italic* _also_ ~~gone~~ `code`'))
      .toBe('<p><strong>bold</strong> <em>italic</em> <em>also</em> <s>gone</s> <code>code</code></p>');
    expect(markdown('**bold with [a link](https://a.com)**'))
      .toBe('<p><strong>bold with <a href="https://a.com">a link</a></strong></p>');
  });

  it('keeps escaped characters and code as written', () => {
    expect(markdown('\\*not italic\\* but **bold**')).toBe('<p>*not italic* but <strong>bold</strong></p>');
    expect(markdown('`**not bold**`')).toBe('<p><code>**not bold**</code></p>');
  });

  it('formats headings, lists, quotes and dividers, leaving out blank lines', () => {
    expect(markdown('# Title\n\nSome text\n\n## Part\n---\n> quoted\n> lines'))
      .toBe('<h1>Title</h1><p>Some text</p><h2>Part</h2><hr><blockquote><p>quoted</p><p>lines</p></blockquote>');
    expect(markdown('###### Six')).toBe('<h5>Six</h5>');
  });

  it('builds bullet and numbered lists, nested by indenting', () => {
    expect(markdown('- one\n- two\n  - inner\n- three')).toBe('<ul><li>one</li><li>two<ul><li>inner</li></ul></li><li>three</li></ul>');
    expect(markdown('1. first\n2. second\n\n3. third')).toBe('<ol><li>first</li><li>second</li><li>third</li></ol>');
    expect(markdown('- bullet\n1. number')).toBe('<ul><li>bullet</li></ul><ol><li>number</li></ol>');
  });

  it('keeps code blocks exactly as written, with their language', () => {
    expect(markdown('```js\nconst a = **b**;\n- not a list\n```\nafter'))
      .toBe('<pre><code class="language-javascript">const a = **b**;\n- not a list</code></pre><p>after</p>');
    expect(markdown('```\nplain\n```')).toBe('<pre><code>plain</code></pre>');
  });

  it('pastes a copied page link as the same page link', () => {
    expect(markdown('Plan', '<a class="page-link" data-page="n1">Plan</a>')).toBe('<p><a class="page-link" data-page="n1">Plan</a></p>');
  });
});


/* =========================
   Inserting Pasted Lines
   ========================= */

describe('insertPasted', () => {
  it('puts one line of formatted words at the caret', () => {
    const body = editor('<p>Go to | now</p>');
    expect(paste(body, '[Google](https://google.com)')?.added).toBe(false);
    expect(body.innerHTML).toBe('<p>Go to <a href="https://google.com">Google</a> now</p>');
    expect(getOffset(body)).toBe('Go to Google'.length);
  });

  it('replaces the <br> of an empty line', () => {
    const body = editor('<p><br>|</p>');
    paste(body, '**bold**');
    expect(body.innerHTML).toBe('<p><strong>bold</strong></p>');
  });

  it('splits the line around pasted lines, joining the text on either side', () => {
    const body = editor('<p>Before | after</p>');
    const result = paste(body, 'first **line**\n# Heading\nlast line');
    expect(result?.added).toBe(true);
    expect(body.innerHTML).toBe('<p>Before first <strong>line</strong></p><h1>Heading</h1><p>last line after</p>');
    expect(result?.line.tagName).toBe('P');
    expect(getOffset(result?.line as Element)).toBe('last line'.length);
  });

  it('joins the text after the caret to the last pasted list item', () => {
    const body = editor('<p>|after</p>');
    paste(body, '- a\n- b');
    expect(body.innerHTML).toBe('<ul><li>a</li><li>bafter</li></ul>');
  });

  it('keeps the text after the caret on its own line after a divider', () => {
    const body = editor('<p>Before |after</p>');
    paste(body, 'one\n---');
    expect(body.innerHTML).toBe('<p>Before one</p><hr><p>after</p>');
  });

  it('adds pasted lines as items when the caret is in a list', () => {
    const body = editor('<ul><li>one|</li></ul>');
    paste(body, '- two\n- three');
    expect(body.innerHTML).toBe('<ul><li>onetwo</li><li>three</li></ul>');
  });

  it('joins pasted lines with line breaks inside a table cell', () => {
    const body = editor('<table><tbody><tr><td>|</td></tr></tbody></table>');
    paste(body, '- **a**\n- b');
    expect(body.querySelector('td')?.innerHTML).toBe('<strong>a</strong><br>b');
  });

  it('moves the caret to the line after a pasted code block', () => {
    const body = editor('<p>|</p>');
    const result = paste(body, '```\ncode\n```');
    expect(body.innerHTML).toBe('<pre><code>code</code></pre><p><br></p>');
    expect(result?.line.tagName).toBe('P');
  });
});


/* =========================
   Markdown Tables
   ========================= */

describe('pasting Markdown tables', () => {
  it('turns a table into a note table with a header row', () => {
    expect(markdown('| Name | Value |\n| --- | :---: |\n| Alpha | **1** |\n| Beta |')).toBe(
      '<table class="fit-content"><tbody><tr><th>Name</th><th>Value</th></tr><tr><td>Alpha</td><td><strong>1</strong></td></tr><tr><td>Beta</td><td><br></td></tr></tbody></table>'
    );
  });

  it('keeps a | written as \\| inside a cell', () => {
    expect(markdown('| a \\| b |\n| --- |\n| c |')).toContain('<th>a | b</th>');
  });

  it('leaves lines with | but no rule under them as text', () => {
    expect(markdown('| not | a table |')).toBeNull();
  });

  it('puts the caret on the line after a pasted table', () => {
    const body = editor('<p>|</p>');
    paste(body, '| a |\n| --- |\n| b |');
    expect(body.querySelector('table')).not.toBeNull();
    expect(body.lastElementChild?.tagName).toBe('P');
  });
});


/* =========================
   Pasting Numbered Lines
   ========================= */

describe('pasting numbered lines', () => {
  it('keeps a numbered line that does not start at 1 as text, such as a section heading', () => {
    expect(markdown('11. Design Diagrams and Wireframes\nThis section describes them.\n11.1 Design Scope')).toBeNull();
  });

  it('still makes a list from 1, and keeps the numbers that carry it on', () => {
    expect(markdown('1. First\n2. Second')).toBe('<ol><li>First</li><li>Second</li></ol>');
    expect(markdown('2. Second\n3. Third')).toBeNull();
  });
});


/* =========================
   Pasting Tab-Separated Tables
   ========================= */

describe('pasting tab-separated tables', () => {
  it('turns lines with tabs between words into a table, its first row the header row', () => {
    const copied = 'Permission Code\tApplicable Use Case(s)\tAccess\ncategory.view\tUC-6.4\tPublic\narea.manage\tUC-6.5, UC-6.6\tPlatform Management\n';
    expect(markdown(copied)).toBe(
      '<table class="fit-content"><tbody><tr><th>Permission Code</th><th>Applicable Use Case(s)</th><th>Access</th></tr>'
      + '<tr><td>category.view</td><td>UC-6.4</td><td>Public</td></tr><tr><td>area.manage</td><td>UC-6.5, UC-6.6</td><td>Platform Management</td></tr></tbody></table>'
    );
  });

  it('keeps empty cells and fills short rows, as spreadsheets copy them', () => {
    expect(markdown('a\t\tc\nd\te')).toContain('<tr><td>d</td><td>e</td><td><br></td></tr>');
  });

  it('leaves a single line with tabs, and lines indented with tabs, as they are', () => {
    expect(markdown('one\ttwo')).toBeNull();
    expect(markdown('- item\n\t- nested\n\t- nested')).toContain('<ul><li>item<ul><li>nested</li><li>nested</li></ul></li></ul>');
  });
});


/* =========================
   Pasting Checklists
   ========================= */

describe('pasting checklists', () => {
  it('turns "- [ ]" and "- [x]" lines into a checklist, separate from a bulleted list beside it', () => {
    expect(markdown('- [ ] Pack\n- [x] Book flights\n- Notes')).toBe(
      '<ul class="checklist"><li>Pack</li><li class="is-checked">Book flights</li></ul><ul><li>Notes</li></ul>'
    );
  });
});


/* =========================
   Linking Selected Words
   ========================= */

/* An editable note body with the words between "[" and "]" selected. */
function selected(html: string) {
  const body = document.createElement('div');
  body.contentEditable = 'true';
  body.innerHTML = html.replace('[', '<span id="from"></span>').replace(']', '<span id="to"></span>');
  document.body.replaceChildren(body);
  const range = document.createRange();
  range.setStartAfter(body.querySelector('#from') as Element);
  range.setEndBefore(body.querySelector('#to') as Element);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
  return body;
}

/* The body's HTML without the selection markers. */
function linked(body: HTMLElement) {
  body.querySelectorAll('#from, #to').forEach(mark => mark.remove());
  body.normalize();
  return body.innerHTML;
}

describe('pasting an address over selected words', () => {
  it('links the words instead of replacing them, and keeps them selected', () => {
    const body = selected('<p>Read [the guide] first</p>');
    expect(linkSelectionToPasted(body, 'https://example.com/guide\n')).toBe(true);
    expect(window.getSelection()?.toString()).toBe('the guide');
    expect(linked(body)).toBe('<p>Read <a href="https://example.com/guide">the guide</a> first</p>');
  });

  it('links to a note or a block from its copied address, and keeps the words\' formatting', () => {
    const body = selected('<p>See [<strong>the plan</strong>]</p>');
    expect(linkSelectionToPasted(body, 'http://localhost:5173/#note=welcome&block=labc1234')).toBe(true);
    expect(linked(body)).toBe('<p>See <a class="page-link" data-page="welcome" data-link-id="labc1234"><strong>the plan</strong></a></p>');
  });

  it('links to the address itself for a note this browser does not have', () => {
    const body = selected('<p>[words]</p>');
    expect(linkSelectionToPasted(body, 'http://localhost:5173/#note=missing-note')).toBe(true);
    expect(linked(body)).toBe('<p><a href="http://localhost:5173/#note=missing-note">words</a></p>');
  });

  it('changes where a link leads when the words are inside it', () => {
    const body = selected('<p><a href="https://old.example">the [guide]</a></p>');
    expect(linkSelectionToPasted(body, 'example.com')).toBe(true);
    expect(linked(body)).toBe('<p><a href="https://example.com">the guide</a></p>');
  });

  it('takes words out of a link they only partly cover', () => {
    const body = selected('<p><a href="https://old.example">one [two</a> three]</p>');
    expect(linkSelectionToPasted(body, 'https://new.example')).toBe(true);
    expect(linked(body)).toBe('<p><a href="https://old.example">one </a><a href="https://new.example">two three</a></p>');
  });

  it('pastes as usual for text that is not one address, across lines, in code, or over spaces only', () => {
    expect(linkSelectionToPasted(selected('<p>[words]</p>'), 'see example.com')).toBe(false);
    expect(linkSelectionToPasted(selected('<p>[one</p><p>two]</p>'), 'https://example.com')).toBe(false);
    expect(linkSelectionToPasted(selected('<pre><code>[x]</code></pre>'), 'https://example.com')).toBe(false);
    expect(linkSelectionToPasted(selected('<p>[ ]</p>'), 'https://example.com')).toBe(false);
  });
});
