import { describe, expect, it } from 'vitest';
import { boardColumns, currentSprint, isOverdue } from '../../../src/frontend/boardspace/board/boardColumns';
import { NOBODY } from '../../../src/frontend/boardspace/list/listRows';
import type { BoardProject, WorkItem } from '../../../src/shared/types/board';

function item(id: string, fields: Partial<WorkItem> = {}): WorkItem {
  return { id, name: id, type: 'task', parentId: '', sprintId: 's1', status: 'todo', assignee: '', start: '2026-10-05', end: '2026-10-09', color: '#4e82f7', progress: 0, manualBacklog: false, order: 0, ...fields };
}

const PROJECT: BoardProject = {
  version: 5,
  title: 'Test',
  members: ['Ana'],
  sprints: [
    { id: 's1', name: 'Sprint 1', start: '2026-10-05', end: '2026-10-16', order: 0 },
    { id: 's2', name: 'Sprint 2', start: '2026-10-19', end: '2026-10-30', order: 1 }
  ],
  items: [
    item('epic', { type: 'epic', order: 0 }),
    item('feature', { type: 'feature', parentId: 'epic', status: 'progress', order: 1 }),
    item('a', { parentId: 'feature', status: 'progress', assignee: 'Ana', order: 2 }),
    item('b', { status: 'done', order: 3 }),
    item('c', { sprintId: 's2', status: 'blocked', order: 4 })
  ],
  collapsedSprints: {},
  collapsedItems: {}
};

const ids = (filters = {}) => boardColumns(PROJECT, { search: '', assignee: '', sprint: '', ...filters }).map(column => `${column.status}: ${column.items.map(entry => entry.id).join(' ')}`);


/* =========================
   Board Columns
   ========================= */

describe('work board', () => {
  it('has a column per status holding features and tasks in the project order, without epics', () => {
    expect(ids()).toEqual(['todo: ', 'progress: feature a', 'review: ', 'done: b', 'blocked: c']);
  });

  it('narrows the cards by words, assignee and sprint', () => {
    expect(ids({ assignee: 'Ana' })).toEqual(['todo: ', 'progress: a', 'review: ', 'done: ', 'blocked: ']);
    expect(ids({ assignee: NOBODY, sprint: 's1' })).toEqual(['todo: ', 'progress: feature', 'review: ', 'done: b', 'blocked: ']);
    expect(ids({ search: 'c' })).toEqual(['todo: ', 'progress: ', 'review: ', 'done: ', 'blocked: c']);
  });

  it('opens on the sprint today falls in, or every sprint between sprints', () => {
    expect(currentSprint(PROJECT, '2026-10-20')).toBe('s2');
    expect(currentSprint(PROJECT, '2026-10-17')).toBe('');
  });

  it('marks work past its due date as overdue until it is done', () => {
    expect(isOverdue(item('x', { end: '2026-10-09' }), '2026-10-10')).toBe(true);
    expect(isOverdue(item('x', { end: '2026-10-09', status: 'done' }), '2026-10-10')).toBe(false);
    expect(isOverdue(item('x', { end: '2026-10-10' }), '2026-10-10')).toBe(false);
  });
});
