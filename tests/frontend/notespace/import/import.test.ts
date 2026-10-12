import { describe, expect, it } from 'vitest';
import { readHtml } from '../../../../src/frontend/notespace/import/importHtml';
import { readMarkdown } from '../../../../src/frontend/notespace/import/importMarkdown';
import { csvRows, readCsv, readText } from '../../../../src/frontend/notespace/import/importText';
import { fitContent, importFile } from '../../../../src/frontend/notespace/import/importNotes';
import { fileTitle, splitIcon } from '../../../../src/frontend/notespace/import/imported';
import { childrenOf, getNote } from '../../../../src/frontend/notespace/store';

/* Every note's text, with links to other notes of the file leading nowhere. */
async function texts(notes: Awaited<ReturnType<typeof readHtml>>) {
  return Promise.all(notes.map(note => note.content(() => undefined)));
}


/* =========================
   Shared Helpers
   ========================= */

describe('import helpers', () => {
  it('titles a note after its file name', () => {
    expect(fileTitle('Meeting notes.final.md')).toBe('Meeting notes.final');
    expect(fileTitle('.md')).toBe('Imported note');
  });

  it('reads an emoji at the start of a title as the note icon', () => {
    expect(splitIcon('📘 Reading list')).toEqual({ icon: '📘', title: 'Reading list' });
    expect(splitIcon('Reading list')).toEqual({ icon: '', title: 'Reading list' });
  });

  it('shortens text that is too long at a whole line, saying so', () => {
    const html = '<p>line</p>'.repeat(40000);
    const fitted = fitContent(html);
    expect(fitted.length).toBeLessThan(250000);
    expect(fitted.endsWith('so it was left out.</em></p>')).toBe(true);
  });
});


/* =========================
   Markdown
   ========================= */

describe('importing Markdown', () => {
  it('takes the title from a first # heading and reads the rest as note lines', async () => {
    const [note] = readMarkdown('# Plans\n\nSome **bold** text.\n\n- one\n- two', 'file');
    expect(note.title).toBe('Plans');
    expect(await note.content(() => undefined)).toBe('<p>Some <strong>bold</strong> text.</p><ul><li>one</li><li>two</li></ul>');
  });

  it('uses the file name when there is no title heading', () => {
    expect(readMarkdown('Just text', 'My file')[0].title).toBe('My file');
  });

  it('gives a Starjot export its details, remarks and sub-notes back', async () => {
    const exported = [
      '# 📘 Main',
      '**Category:** Work  \n**Description:** About things',
      '**Remarks:**',
      'A remark.',
      '**Sub-notes:** [Child](#child)',
      'See [Child](#child).',
      '---',
      '# Child',
      'Child text.'
    ].join('\n\n');
    const notes = readMarkdown(exported, 'file');
    expect(notes.map(note => note.title)).toEqual(['Main', 'Child']);
    expect(notes[0]).toMatchObject({ icon: '📘', category: 'Work', description: 'About things', remarks: '<p>A remark.</p>' });

    /* The link to the sub-note's heading leads to the new sub-note. */
    const getsChild = (key: string) => (key === '1' ? 'note_child' : undefined);
    expect(await notes[0].content(getsChild)).toContain('#note=note_child');
    expect(await notes[1].content(() => undefined)).toBe('<p>Child text.</p>');
  });

  it('keeps a divider followed by a heading in one note when nothing lists sub-notes', () => {
    expect(readMarkdown('# A\n\nText\n\n---\n\n# B\n\nMore', 'file')).toHaveLength(1);
  });

  it('turns a picture on the web into a link to it, so nothing is fetched', async () => {
    const [note] = readMarkdown('![A cat](https://example.com/cat.png)', 'file');
    expect(await note.content(() => undefined)).toBe('<p><a href="https://example.com/cat.png">A cat</a></p>');
  });
});


/* =========================
   HTML
   ========================= */

describe('importing HTML', () => {
  it('reads an ordinary page as one note, titled by its title', async () => {
    const notes = await readHtml('<html><head><title>Recipe</title><style>p{}</style></head><body><h1>Recipe</h1><div><p>Mix   the\n flour.</p>Loose words<br>Second line<script>alert(1)</script></div><h6>Small</h6></body></html>', 'file');
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe('Recipe');
    expect((await texts(notes))[0]).toBe('<p>Mix the flour.</p><p>Loose words</p><p>Second line</p><h5>Small</h5>');
  });

  it('keeps formatting written as styles, but not the not-bold wrapper Google Docs adds', async () => {
    const notes = await readHtml('<body><b style="font-weight:normal"><p><span style="font-weight:700">Bold</span> and <span style="font-style:italic">italic</span></p></b></body>', 'file');
    expect((await texts(notes))[0]).toBe('<p><strong>Bold</strong> and <em>italic</em></p>');
  });

  it('keeps lists, nested lists, quotes, code and tables', async () => {
    const html = '<ul><li><p>One</p><ul><li>Inner</li></ul></li></ul><blockquote><h2>Quoted</h2></blockquote><pre class="language-js"><code>let a = 1;</code></pre><table><thead><tr><td>H</td></tr></thead><tbody><tr><td>B</td></tr></tbody></table>';
    const [content] = await texts(await readHtml(`<body>${html}</body>`, 'file'));
    expect(content).toBe('<ul><li>One<ul><li>Inner</li></ul></li></ul><blockquote><p>Quoted</p></blockquote><pre><code class="language-js">let a = 1;</code></pre><table class="fit-content"><tbody><tr><th>H</th></tr><tr><td>B</td></tr></tbody></table>');
  });

  it('gives a Starjot export its notes, details and note links back', async () => {
    const page = (id: string, title: string, body: string, details = '') => `<article class="export-page" id="page-${id}"><div class="note-header"><div class="note-icon">📗</div><h1 class="note-title-input">${title}</h1>${details}</div><div class="note-content"><div class="note-body">${body}</div></div></article>`;
    const details = '<dl class="note-details"><dt>Category</dt><dd>School</dd><dt>Description</dt><dd>Course notes</dd><dt class="note-remarks-label">Remarks</dt><dd><div class="note-remarks"><p>Check</p></div></dd></dl>';
    const html = `<body>${page('old_main', 'Main', '<p><a class="page-block" data-page="old_child" data-size="small" href="#page-old_child"><span class="page-block-text"><strong>Child</strong></span></a></p><p><a class="page-link" data-page="gone" href="#">Gone</a></p>', details)}<hr class="export-divider">${page('old_child', 'Child', '<p>Inside</p>')}</body>`;
    const notes = await readHtml(html, 'file');
    expect(notes.map(note => [note.key, note.title, note.icon])).toEqual([['old_main', 'Main', '📗'], ['old_child', 'Child', '📗']]);
    expect(notes[0]).toMatchObject({ category: 'School', description: 'Course notes', remarks: '<p>Check</p>' });
    const content = await notes[0].content(key => (key === 'old_child' ? 'note_new' : undefined));
    expect(content).toBe('<p><span class="page-block" data-page="note_new" data-size="small"></span></p><p>Gone</p>');
  });
});


/* =========================
   Text and CSV
   ========================= */

describe('importing text', () => {
  it('makes each line of a text file a line of the note', async () => {
    const [note] = readText('First line\n\n\nSecond <line>\n', 'Notes');
    expect(note.title).toBe('Notes');
    expect(await note.content(() => undefined)).toBe('<p>First line</p><p>Second &lt;line&gt;</p>');
  });

  it('gives a Starjot text export its title, details, remarks and sub-notes back', async () => {
    const divider = '='.repeat(40);
    const text = `📕 Main\n=======\n\nCategory: Personal\nCreated: 12 Oct 2026\n\nRemarks:\n    First remark\n\n    Second remark\n\nSub-notes: Child\n\nBody text\n\n${divider}\n\nChild\n=====\n\nChild text\n`;
    const notes = readText(text, 'file');
    expect(notes.map(note => note.title)).toEqual(['Main', 'Child']);
    expect(notes[0]).toMatchObject({ icon: '📕', category: 'Personal', remarks: '<p>First remark</p><p>Second remark</p>' });
    expect(await notes[0].content(() => undefined)).toBe('<p>Body text</p>');
  });
});

describe('importing CSV', () => {
  it('reads quoted values with commas, quotes and line breaks', () => {
    expect(csvRows('name,note\r\n"Smith, J","Said ""hi""\nthen left"\n\n')).toEqual([['name', 'note'], ['Smith, J', 'Said "hi"\nthen left']]);
  });

  it('notices files separated by semicolons or tabs', () => {
    expect(csvRows('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(csvRows('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('makes one table with a header row, filling short rows', async () => {
    const [note] = readCsv('a,b\n1', 'Data');
    expect(await note.content(() => undefined)).toBe('<table class="fit-content"><tbody><tr><th>a</th><th>b</th></tr><tr><td>1</td><td><br></td></tr></tbody></table>');
  });
});


/* =========================
   Making Notes
   ========================= */

describe('importing a file', () => {
  it('makes new notes, with the other notes of an export as sub-notes', async () => {
    const markdown = '# Parent\n\n**Sub-notes:** [Kid](#kid)\n\nHello\n\n---\n\n# Kid\n\nThere';
    const id = await importFile(new File([markdown], 'export.md'));
    expect(getNote(id)?.title).toBe('Parent');
    expect(childrenOf(id).map(note => note.title)).toEqual(['Kid']);
  });

  it('explains which files it cannot import', async () => {
    await expect(importFile(new File(['x'], 'picture.png'))).rejects.toThrow('Starjot can import Markdown, HTML, PDF, CSV and plain text files.');
  });
});
