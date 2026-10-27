import { describe, expect, it } from 'vitest';
import { createNote, updateNote } from '../../../../src/frontend/notespace/store';
import { markdownOf, notesMarkdown } from '../../../../src/frontend/notespace/export/exportMarkdown';
import { pageHref } from '../../../../src/frontend/notespace/export/exportNotes';
import { DEFAULT_EXPORT } from '../../../../src/frontend/notespace/export/exportSettings';
import { readMarkdown } from '../../../../src/frontend/notespace/import/importMarkdown';
import type { Note } from '../../../../src/shared/types/note';

/* A note holding the given text, with no details filled in. */
function note(content: string, title = 'Plan') {
  const created = createNote();
  return { ...(updateNote(created.id, { title, content }) as Note), createdAt: null };
}

const settings = { ...DEFAULT_EXPORT, details: false };

/* A Markdown file read as one note whose new id is "note_new". */
async function imported(markdown: string) {
  const [first] = readMarkdown(markdown, 'file');
  return first.content(key => (key === '0' ? 'note_new' : undefined));
}

/* The link id a block got on import, read from its HTML. */
function idIn(html: string, tag: string) {
  return html.match(new RegExp(`<${tag} data-link-id="(l[a-z0-9]+)"`))?.[1] ?? '';
}


/* =========================
   Importing Spots
   ========================= */

describe('importing links to spots in a Markdown file', () => {
  it('turns <a id> spots and links to them into block links in the note', async () => {
    const html = await imported('Intro\n\n<a id="cap-04"></a>\n\n## Chapter 4\n\nSee [chapter four](#cap-04).');
    const id = idIn(html, 'h2');
    expect(id).toMatch(/^l/);
    expect(html).toBe(`<p>Intro</p><h2 data-link-id="${id}">Chapter 4</h2><p>See <a class="page-link" data-page="note_new" data-link-id="${id}">chapter four</a>.</p>`);
  });

  it('reads a spot at the start of a line, and <a name> spots', async () => {
    const html = await imported('<a name="why"></a>Because it matters.\n\n[Why](#why)');
    const id = idIn(html, 'p');
    expect(html).toBe(`<p data-link-id="${id}">Because it matters.</p><p><a class="page-link" data-page="note_new" data-link-id="${id}">Why</a></p>`);
  });

  it('links to headings by the anchors Markdown viewers give them', async () => {
    const html = await imported('[Goals](#our-goals)\n\n## Our goals\n\nShip.');
    const id = idIn(html, 'h2');
    expect(html).toContain(`<a class="page-link" data-page="note_new" data-link-id="${id}">Goals</a>`);
  });

  it('keeps only the words of a link to a spot the file does not have', async () => {
    expect(await imported('See [nowhere](#missing) now.')).toBe('<p>See nowhere now.</p>');
  });

  it('leaves spots and links inside code as written, and gives no ids to unlinked spots', async () => {
    expect(await imported('```html\n<a id="x"></a>\n```')).toContain('&lt;a id="x"&gt;&lt;/a&gt;');
    expect(await imported('<a id="x"></a>\n\nText')).toBe('<p>Text</p>');
  });
});


/* =========================
   Exporting and Round Trips
   ========================= */

describe('exporting block links', () => {
  it('marks linked blocks with their id and links to them in the file, and to Starjot outside it', async () => {
    const outside = note('<p data-link-id="lout00001">Elsewhere</p>', 'Outside');
    const page = note([
      '<h2 data-link-id="labc12345">Goals</h2>',
      '<p data-link-id="lunused01">Not linked</p>',
      `<p><a class="page-link" data-page="PAGE" data-link-id="labc12345">the goals</a> and <a class="page-link" data-page="${outside.id}" data-link-id="lout00001">there</a></p>`
    ].join(''));
    const fixed = { ...page, content: page.content.replace('PAGE', page.id) };
    const markdown = await notesMarkdown([fixed], settings);
    expect(markdown).toContain('## <a id="labc12345"></a>Goals');
    expect(markdown).toContain('[the goals](#labc12345)');
    expect(markdown).toContain(`[there](http://localhost:3000/#note=${outside.id}&block=lout00001)`.replace('http://localhost:3000', window.location.origin));
    expect(markdown).toContain('\n\nNot linked\n\n');
  });

  it('puts the spot of a linked table or code block on its own line before it', async () => {
    const page = note('<table data-link-id="ltab00001"><tbody><tr><td>A</td></tr></tbody></table><p><a class="page-link" data-page="PAGE" data-link-id="ltab00001">table</a></p>');
    const markdown = await notesMarkdown([{ ...page, content: page.content.replace('PAGE', page.id) }], settings);
    expect(markdown).toContain('<a id="ltab00001"></a>\n\n| A |');
  });

  it('copies block links as Starjot addresses', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p><a class="page-link" data-page="atlas" data-link-id="labc12345">plan</a></p>';
    expect(markdownOf(root)).toBe(`[plan](${window.location.origin}${window.location.pathname}#note=atlas&block=labc12345)`);
  });

  it('comes back as the same block links when the export is imported', async () => {
    const page = note('<h2 data-link-id="labc12345">Goals</h2><p><a class="page-link" data-page="PAGE" data-link-id="labc12345">the goals</a></p>');
    const markdown = await notesMarkdown([{ ...page, content: page.content.replace('PAGE', page.id) }], settings);
    const html = await imported(markdown);
    expect(html).toBe('<h2 data-link-id="labc12345">Goals</h2><p><a class="page-link" data-page="note_new" data-link-id="labc12345">the goals</a></p>');
  });

  it('links blocks between the notes of one exported file again on import', async () => {
    const markdown = [
      '# Main', '**Sub-notes:** [Child](#child)', 'See [the step](#lstep0001).', '---',
      '# Child', '<a id="lstep0001"></a>First step'
    ].join('\n\n');
    const notes = readMarkdown(markdown, 'file');
    const idOf = (key: string) => ({ 0: 'note_main', 1: 'note_child' } as Record<string, string>)[key];
    expect(await notes[0].content(idOf)).toBe('<p>See <a class="page-link" data-page="note_child" data-link-id="lstep0001">the step</a>.</p>');
    expect(await notes[1].content(idOf)).toBe('<p data-link-id="lstep0001">First step</p>');
  });

  it('jumps to linked blocks inside an HTML or PDF file, and to Starjot outside it', () => {
    expect(pageHref('atlas', new Set(['atlas']), 'labc12345')).toBe('#labc12345');
    expect(pageHref('atlas', new Set(['atlas']))).toBe('#page-atlas');
    expect(pageHref('atlas', new Set(), 'labc12345')).toMatch(/#note=atlas&block=labc12345$/);
  });
});
