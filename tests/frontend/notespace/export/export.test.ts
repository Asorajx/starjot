import { describe, expect, it } from 'vitest';
import { createNote, createSubpage, updateNote } from '../../../../src/frontend/notespace/store';
import { headingAnchor, notesMarkdown } from '../../../../src/frontend/notespace/export/exportMarkdown';
import { exportFileName, exportedNotes, pageAnchor } from '../../../../src/frontend/notespace/export/exportNotes';
import { DEFAULT_EXPORT, normalizeExportSettings } from '../../../../src/frontend/notespace/export/exportSettings';
import { notesText } from '../../../../src/frontend/notespace/export/exportText';
import type { Note } from '../../../../src/shared/types/note';

/* A note holding the given text, with no details filled in. */
function note(content: string, changes: Partial<Note> = {}) {
  const created = createNote();
  return { ...(updateNote(created.id, { title: 'Plan', content }) as Note), createdAt: null, ...changes };
}

const settings = { ...DEFAULT_EXPORT, details: false };


/* =========================
   Settings and Pages
   ========================= */

describe('export settings', () => {
  it('fills in missing settings and keeps the scale within 50 to 200', () => {
    expect(normalizeExportSettings(null)).toEqual(DEFAULT_EXPORT);
    expect(normalizeExportSettings({ format: 'docx', scale: 900, subpages: true, content: 'text' }))
      .toEqual({ ...DEFAULT_EXPORT, scale: 200, subpages: true, content: 'text' });
  });

  it('names files after the note, without characters files cannot have', () => {
    expect(exportFileName('Plan: A/B?', 'md')).toBe('Plan- A-B-.md');
    expect(exportFileName('   ', 'txt')).toBe('Untitled note.txt');
  });
});

describe('exportedNotes', () => {
  it('adds sub-pages after the note, in the order their cards appear in its text', () => {
    const parent = createNote();
    const first = createSubpage(parent.id) as Note;
    const second = createSubpage(parent.id) as Note;
    updateNote(parent.id, { content: `<p><span class="page-block" data-page="${second.id}"></span></p>` });
    expect(exportedNotes(parent.id, true).map(item => item.id)).toEqual([parent.id, second.id, first.id]);
    expect(exportedNotes(parent.id, false).map(item => item.id)).toEqual([parent.id]);
    expect(pageAnchor('abc')).toBe('page-abc');
  });
});


/* =========================
   Markdown
   ========================= */

describe('notesMarkdown', () => {
  it('writes headings, formatting, links, lists, quotes and code', async () => {
    const page = note('<h2>Goals</h2><p>Some <strong>bold</strong>, <em>slanted</em> and <a href="https://a.com">linked</a> words.</p>'
      + '<ul><li>one<ul><li>inner</li></ul></li><li>two</li></ul><ol><li>first</li></ol>'
      + '<blockquote><p>quoted</p></blockquote><pre><code class="language-javascript">let a = 1;</code></pre><hr>');
    expect(await notesMarkdown([page], settings)).toBe('# Plan\n\n## Goals\n\nSome **bold**, *slanted* and [linked](https://a.com) words.\n\n'
      + '- one\n  - inner\n- two\n\n1. first\n\n> quoted\n\n```javascript\nlet a = 1;\n```\n\n---\n');
  });

  it('writes every tab of a tab block, each under its name', async () => {
    const page = note('<div class="tab-block"><div class="tab-panel is-active" data-title="Setup"><p>Run it.</p></div><div class="tab-panel" data-title="Usage"><p>Open it.</p></div></div>');
    expect(await notesMarkdown([page], settings)).toBe('# Plan\n\n#### Setup\n\nRun it.\n\n#### Usage\n\nOpen it.\n');
    expect(notesText([page], settings)).toBe('Plan\n====\n\nSetup\n    Run it.\n\nUsage\n    Open it.\n');
  });

  it('writes checklists as "- [ ]" and "- [x]"', async () => {
    const page = note('<ul class="checklist"><li>Pack</li><li class="is-checked">Book</li></ul>');
    expect(await notesMarkdown([page], settings)).toBe('# Plan\n\n- [ ] Pack\n- [x] Book\n');
    expect(notesText([page], settings)).toBe('Plan\n====\n\n☐ Pack\n☑ Book\n');
  });

  it('writes tables, open toggles and escapes Markdown characters in the text', async () => {
    const page = note('<table><tbody><tr><th>Name</th><th>Note</th></tr><tr><td>a|b</td><td>*x*</td></tr></tbody></table>'
      + '<div class="toggle-block"><p class="toggle-summary">More</p><div class="toggle-body"><p># not a heading</p></div></div>');
    expect(await notesMarkdown([page], settings)).toBe('# Plan\n\n| Name | Note |\n| --- | --- |\n| a\\|b | \\*x\\* |\n\n'
      + '<details>\n<summary>More</summary>\n\n\\# not a heading\n\n</details>\n');
  });

  it('leaves out comments, and links pages in the file to their headings', async () => {
    const other = note('<p>Inside</p>', { title: 'Other page' });
    const page = note(`<p><span class="comment-mark" data-comment="c1">marked</span> <a class="page-link" data-page="${other.id}">see</a></p>`);
    expect(await notesMarkdown([page, { ...other, title: 'Other page' }], settings))
      .toBe('# Plan\n\nmarked [see](#other-page)\n\n---\n\n# Other page\n\nInside\n');
  });

  it('makes heading anchors the way Markdown viewers do', () => {
    const taken = new Set<string>();
    expect(headingAnchor('🙂 My Plan, v2!', taken)).toBe('my-plan-v2');
    expect(headingAnchor('My Plan v2', taken)).toBe('my-plan-v2-1');
  });
});


/* =========================
   Plain Text
   ========================= */

describe('notesText', () => {
  it('writes plain text, leaving out page cards, page links and pictures', () => {
    const page = note('<h2>Goals</h2><p>Read <a class="page-link" data-page="x">this</a>the plan. <span class="page-block" data-page="x"></span></p>'
      + '<ul><li>one<ol><li>inner</li></ol></li></ul><table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>'
      + '<div class="toggle-block"><p class="toggle-summary">More</p><div class="toggle-body"><p>hidden</p></div></div>'
      + '<p><span class="image-block" data-image="img_a"></span></p>');
    expect(notesText([page], settings)).toBe('Plan\n====\n\nGoals\n\nRead the plan.\n\n• one\n  1. inner\n\na\tb\n\nMore\n    hidden\n');
  });

  it('leaves out the details that are not ticked', () => {
    const page = note('<p>Text</p>', { subtitle: 'About it', remarks: '<p>Check</p>', createdAt: '2026-01-02T00:00:00.000Z' });
    const parts = { ...DEFAULT_EXPORT.detailParts, description: false, created: false };
    expect(notesText([page], { ...settings, details: true, detailParts: parts })).toBe('Plan\n====\n\nRemarks:\n    Check\n\nText\n');
  });

  it('adds the details when asked, and divides pages with a line', () => {
    const page = note('<p>Text</p>', { subtitle: 'About it', createdAt: null });
    const text = notesText([page, page], { ...settings, details: true });
    expect(text).toBe(`Plan\n====\n\nDescription: About it\n\nText\n\n${'='.repeat(40)}\n\nPlan\n====\n\nDescription: About it\n\nText\n`);
  });
});
