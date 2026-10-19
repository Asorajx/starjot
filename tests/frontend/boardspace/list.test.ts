import { describe, expect, it } from 'vitest';
import { listRows, NO_FILTERS, NOBODY, type ListFilters, type ListSort } from '../../../src/frontend/boardspace/list/listRows';
import { BACKLOG } from '../../../src/frontend/boardspace/workItems';
import type { BoardProject, WorkItem } from '../../../src/shared/types/board';

function item(id: string, fields: Partial<WorkItem> = {}): WorkItem {
  return { id, name: id, type: 'task', parentId: '', sprintId: 's1', status: 'todo', assignee: '', start: '2026-10-05', end: '2026-10-09', color: '#4e82f7', progress: 0, manualBacklog: false, order: 0, ...fields };
}

/* Sprint 2 comes first by order; the epic holds two tasks; one task is in the backlog. */
const PROJECT: BoardProject = {
  version: 5,
  title: 'Test',
  members: ['Ana', 'Bo'],
  sprints: [
    { id: 's1', name: 'Sprint 1', start: '2026-10-12', end: '2026-10-23', order: 1 },
    { id: 's2', name: 'Sprint 2', start: '2026-10-05', end: '2026-10-09', order: 0 }
  ],
  items: [
    item('epic', { type: 'epic', name: 'Website', order: 0 }),
    item('copy', { parentId: 'epic', name: 'Write copy', status: 'done', assignee: 'Bo', start: '2026-10-14', order: 1 }),
    item('hero', { parentId: 'epic', name: 'Design hero', status: 'progress', assignee: 'Ana', start: '2026-10-12', order: 2 }),
    item('early', { sprintId: 's2', name: 'Kick-off', start: '2026-10-05' }),
    item('later', { sprintId: '', name: 'Archive old site' })
  ],
  collapsedSprints: { s1: true },
  collapsedItems: {}
};

const ids = (filters: Partial<ListFilters> = {}, sort: ListSort = { key: 'order', descending: false }) => listRows(PROJECT, { ...NO_FILTERS, ...filters }, sort).map(entry => entry.id);


/* =========================
   List Rows
   ========================= */

describe('work list', () => {
  it('lists every item in the project\'s order, ignoring folded sprints', () => {
    expect(ids()).toEqual(['early', 'epic', 'copy', 'hero', 'later']);
  });

  it('filters by words, kind, status, assignee and sprint', () => {
    expect(ids({ search: 'ana' })).toEqual(['hero']);
    expect(ids({ type: 'epic' })).toEqual(['epic']);
    expect(ids({ status: 'done' })).toEqual(['copy']);
    expect(ids({ status: 'todo' })).toEqual(['early', 'later']);
    expect(ids({ assignee: NOBODY })).toEqual(['early', 'epic', 'later']);
    expect(ids({ assignee: 'Bo' })).toEqual(['copy']);
    expect(ids({ sprint: BACKLOG })).toEqual(['later']);
    expect(ids({ sprint: 's2' })).toEqual(['early']);
  });

  it('sorts by a column either way, keeping the project\'s order for ties', () => {
    expect(ids({}, { key: 'name', descending: false })).toEqual(['later', 'hero', 'early', 'epic', 'copy']);
    expect(ids({}, { key: 'status', descending: false })).toEqual(['early', 'later', 'hero', 'copy', 'epic']);
    expect(ids({}, { key: 'assignee', descending: false })).toEqual(['hero', 'copy', 'early', 'epic', 'later']);
    expect(ids({}, { key: 'sprint', descending: true })).toEqual(['later', 'epic', 'copy', 'hero', 'early']);
    expect(ids({}, { key: 'start', descending: false })).toEqual(['early', 'epic', 'later', 'hero', 'copy']);
  });
});
