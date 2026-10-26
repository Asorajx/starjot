import { describe, expect, it, vi } from 'vitest';

/* A Markdown file whose third note cannot be read. */
vi.mock('../../../../src/frontend/notespace/import/importMarkdown', () => ({
  readMarkdown: () => [
    { key: 'main', title: 'Main', content: () => '<p>main</p>' },
    { key: 'one', title: 'Sub one', content: () => '<p>one</p>' },
    { key: 'two', title: 'Sub two', content: () => { throw new Error('unreadable'); } }
  ]
}));

import { importFiles } from '../../../../src/frontend/notespace/import/importNotes';
import { getNotes } from '../../../../src/frontend/notespace/store';


/* =========================
   Failed Imports
   ========================= */

describe('an import that fails partway', () => {
  it('reports the file and leaves no notes behind', async () => {
    const before = getNotes().length;
    const result = await importFiles([new File(['# Main'], 'broken.md')]);
    expect(result.created).toEqual([]);
    expect(result.failed).toEqual([{ name: 'broken.md', reason: 'The file could not be read.' }]);
    expect(getNotes()).toHaveLength(before);
  });
});
