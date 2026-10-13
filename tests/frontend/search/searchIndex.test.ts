import { describe, expect, it } from 'vitest';
import { dayGroup, search, type SearchEntry } from '../../../src/frontend/search/searchIndex';

const entry = (changes: Partial<SearchEntry>): SearchEntry => ({
  kind: 'note', id: 'n', title: 'Note', path: [], text: '', scope: '', updatedAt: '2026-10-01T00:00:00.000Z', ...changes
});
const everything = { titleOnly: false, scope: 'all' };
const ids = (results: ReturnType<typeof search>) => results.map(result => result.entry.id);


/* =========================
   Matching
   ========================= */

describe('search', () => {
  it('finds nothing for an empty search', () => {
    expect(search([entry({})], '   ', everything)).toEqual([]);
  });

  it('ignores case and accents', () => {
    const entries = [entry({ id: 'a', title: 'Café plans' })];
    expect(ids(search(entries, 'CAFE', everything))).toEqual(['a']);
  });

  it('needs every word, in the title or the text', () => {
    const entries = [entry({ id: 'a', title: 'Weekly notes', text: 'budget review' }), entry({ id: 'b', title: 'Weekly notes' })];
    expect(ids(search(entries, 'weekly budget', everything))).toEqual(['a']);
  });

  it('puts title matches first, then the newest', () => {
    const entries = [
      entry({ id: 'text', title: 'Other', text: 'atlas', updatedAt: '2026-10-09T00:00:00.000Z' }),
      entry({ id: 'contains', title: 'Project atlas', updatedAt: '2026-10-02T00:00:00.000Z' }),
      entry({ id: 'start', title: 'Atlas brief' }),
      entry({ id: 'exact', title: 'Atlas' })
    ];
    expect(ids(search(entries, 'atlas', everything))).toEqual(['exact', 'start', 'contains', 'text']);
  });

  it('shows the text around a match in the text, keeping its accents', () => {
    const [result] = search([entry({ title: 'Trip', text: 'We stopped at the café for lunch' })], 'cafe', everything);
    expect(result.snippet).toEqual({ before: 'We stopped at the ', match: 'café', after: ' for lunch' });
    expect(result.findTerm).toBe('cafe');
  });

  it('shortens long text before the match', () => {
    const [result] = search([entry({ text: `${'x'.repeat(100)} target` })], 'target', everything);
    expect(result.snippet?.before.startsWith('…')).toBe(true);
  });

  it('has no excerpt or find words for a title match', () => {
    const [result] = search([entry({ title: 'Budget', text: 'budget' })], 'budget', everything);
    expect(result.snippet).toBeNull();
    expect(result.findTerm).toBe('');
  });

  it('searches only titles when asked', () => {
    const entries = [entry({ id: 'a', title: 'Ideas', text: 'garden' }), entry({ id: 'b', title: 'Garden' })];
    expect(ids(search(entries, 'garden', { titleOnly: true, scope: 'all' }))).toEqual(['b']);
  });

  it('limits results to a category, all notes, or Boardspace', () => {
    const entries = [
      entry({ id: 'work', title: 'Plan', scope: 'cat-work' }),
      entry({ id: 'home', title: 'Plan', scope: 'cat-home' }),
      entry({ id: 'task', kind: 'task', title: 'Plan', scope: 'boardspace' })
    ];
    expect(ids(search(entries, 'plan', { titleOnly: false, scope: 'cat-work' }))).toEqual(['work']);
    expect(ids(search(entries, 'plan', { titleOnly: false, scope: 'notes' })).sort()).toEqual(['home', 'work']);
    expect(ids(search(entries, 'plan', { titleOnly: false, scope: 'boardspace' }))).toEqual(['task']);
  });
});


/* =========================
   Recent Notes
   ========================= */

describe('day groups', () => {
  const now = new Date(2026, 9, 12, 15, 0);

  it('sorts opened times into today, yesterday and earlier', () => {
    expect(dayGroup(new Date(2026, 9, 12, 0, 5).toISOString(), now)).toBe('Today');
    expect(dayGroup(new Date(2026, 9, 11, 23, 0).toISOString(), now)).toBe('Yesterday');
    expect(dayGroup(new Date(2026, 9, 10, 23, 0).toISOString(), now)).toBe('Earlier');
  });
});
