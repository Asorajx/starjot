import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addMonths, daysBetween, dayRange, parseDay, weekStart } from '../../../src/frontend/boardspace/dates';
import { canHoldWork, epicCompletion, familyOf, shownSprintOf, timelineRows } from '../../../src/frontend/boardspace/workItems';
import type { BoardProject, WorkItem } from '../../../src/shared/types/board';

/* The store loads the saved project when imported, so each test starts with empty storage and */
/* a fresh copy, like opening the app again. */
beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

const openBoard = () => import('../../../src/frontend/boardspace/board');

function item(id: string, fields: Partial<WorkItem> = {}): WorkItem {
  return { id, name: id, type: 'task', parentId: '', sprintId: '', status: 'todo', assignee: '', start: '2026-10-05', end: '2026-10-09', color: '#4e82f7', progress: 0, manualBacklog: false, order: 0, ...fields };
}

function project(items: WorkItem[], sprints = [{ id: 's1', name: 'Sprint 1', start: '2026-10-05', end: '2026-10-16', order: 0 }]): BoardProject {
  return { version: 5, title: 'Test', members: [], sprints, items, collapsedSprints: {}, collapsedItems: {} };
}


/* =========================
   Days
   ========================= */

describe('calendar days', () => {
  it('reads only real YYYY-MM-DD days', () => {
    expect(parseDay('2026-02-28')?.getDate()).toBe(28);
    expect(parseDay('2026-02-30')).toBeNull();
    expect(parseDay('5 Oct')).toBeNull();
  });

  it('counts days, finds Mondays and adds months', () => {
    expect(daysBetween(new Date(2026, 9, 1), new Date(2026, 9, 31))).toBe(30);
    expect(weekStart(new Date(2026, 9, 18)).getDate()).toBe(12);
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(dayRange('2026-10-05', '2026-10-09')).toContain('–');
  });
});


/* =========================
   Work Items
   ========================= */

describe('work items', () => {
  it('lets epics hold features, and anything hold tasks', () => {
    expect(canHoldWork('epic', 'feature')).toBe(true);
    expect(canHoldWork('feature', 'feature')).toBe(false);
    expect(canHoldWork('task', 'task')).toBe(true);
    expect(canHoldWork('task', 'epic')).toBe(false);
  });

  it('works out an epic\'s progress from all the tasks inside it', () => {
    const items = [item('e', { type: 'epic' }), item('f', { type: 'feature', parentId: 'e' }), item('t1', { parentId: 'f', status: 'done' }), item('t2', { parentId: 't1' })];
    expect([...familyOf(items, 'e')].sort()).toEqual(['e', 'f', 't1', 't2']);
    expect(epicCompletion(items, 'e')).toEqual({ done: 1, total: 2, percent: 50 });
  });

  it('shows an epic without a sprint with the sprint most of its work is in', () => {
    const board = project([item('e', { type: 'epic' }), item('t', { parentId: 'e', sprintId: 's1' })]);
    expect(shownSprintOf(board, board.items[0])).toBe('s1');
    board.items[0].manualBacklog = true;
    expect(shownSprintOf(board, board.items[0])).toBe('');
  });

  it('lists each sprint, then the backlog, with its work as a tree', () => {
    const board = project([item('e', { type: 'epic', sprintId: 's1' }), item('t', { parentId: 'e', sprintId: 's1' }), item('loose')]);
    const rows = timelineRows(board).map(row => (row.kind === 'sprint' ? `sprint:${row.id}` : `${'  '.repeat(row.depth)}${row.item.id}`));
    expect(rows).toEqual(['sprint:s1', 'e', '  t', 'sprint:__backlog__', 'loose']);

    board.collapsedItems.e = true;
    expect(timelineRows(board).map(row => (row.kind === 'item' ? row.item.id : row.id))).toEqual(['s1', 'e', '__backlog__', 'loose']);
  });

  it('searches names and assignees, keeping the items a match sits inside', () => {
    const board = project([item('e', { type: 'epic', sprintId: 's1', name: 'Launch' }), item('t', { parentId: 'e', sprintId: 's1', name: 'Write copy', assignee: 'Ana' }), item('other', { sprintId: 's1' })]);
    const ids = (search: string) => timelineRows(board, search).filter(row => row.kind === 'item').map(row => (row.kind === 'item' ? row.item.id : ''));
    expect(ids('ana')).toEqual(['e', 't']);
    expect(ids('nothing')).toEqual([]);
  });
});


/* =========================
   The Project Store
   ========================= */

describe('project store', () => {
  it('repairs saved projects: bad dates, unknown kinds, loops and duplicate members', async () => {
    const { cleanProject } = await openBoard();
    const cleaned = cleanProject({
      title: '',
      members: ['Ana', 'ana', ''],
      sprints: [{ id: 's1', name: 'One', start: '2026-10-05', end: '2026-10-01' }],
      items: [
        { id: 'a', name: 'A', type: 'story', start: '2026-10-05', end: '2026-10-06', parentId: 'b', color: 'red', assignee: 'Bo' },
        { id: 'b', name: 'B', type: 'task', start: '2026-10-05', end: '2026-10-06', parentId: 'a' },
        { id: 'c', name: 'C', start: 'soon', end: '2026-10-06' }
      ]
    });
    expect(cleaned.title).toBe('Untitled project');
    expect(cleaned.sprints).toEqual([]);
    expect(cleaned.items.map(entry => entry.id)).toEqual(['a', 'b']);
    expect(cleaned.items[0]).toMatchObject({ type: 'task', color: '#4e82f7' });
    expect(cleaned.items.some(entry => entry.parentId === '')).toBe(true);
    expect(cleaned.members).toEqual(['Ana', 'Bo']);
    expect(() => cleanProject({ hello: 1 })).toThrow();
  });

  it('saves work and keeps it after reopening', async () => {
    let board = await openBoard();
    board.saveSprint({ name: 'Sprint 1', start: '2026-10-05', end: '2026-10-16' });
    const sprint = board.getBoard().sprints[0];
    const id = board.saveItem({ name: 'Task', type: 'task', parentId: '', sprintId: sprint.id, status: 'done', assignee: '', start: '2026-10-05', end: '2026-10-06', color: '#4e82f7', progress: 10 });
    expect(board.getBoard().items[0]).toMatchObject({ id, progress: 100 });

    vi.resetModules();
    board = await openBoard();
    expect(board.getBoard().items[0].name).toBe('Task');
  });

  it('moves the work inside an item to its new sprint, and deletes it with the item', async () => {
    const board = await openBoard();
    board.replaceBoard(project([item('e', { type: 'epic', sprintId: 's1' }), item('t', { parentId: 'e', sprintId: 's1' })], [
      { id: 's1', name: 'One', start: '2026-10-05', end: '2026-10-16', order: 0 },
      { id: 's2', name: 'Two', start: '2026-10-19', end: '2026-10-30', order: 1 }
    ]));
    const epic = board.getBoard().items[0];
    board.saveItem({ ...epic, sprintId: 's2' }, 'e');
    expect(board.getBoard().items.map(entry => entry.sprintId)).toEqual(['s2', 's2']);
    board.deleteItem('e');
    expect(board.getBoard().items).toEqual([]);
  });

  it('drops work before, after or inside other work, but never inside itself', async () => {
    const board = await openBoard();
    board.replaceBoard(project([item('a', { sprintId: 's1', order: 0 }), item('b', { sprintId: 's1', order: 1 }), item('c', { sprintId: 's1', order: 2 })]));
    board.moveWork('c', { mode: 'before', targetId: 'a' });
    expect(timelineRows(board.getBoard()).filter(row => row.kind === 'item').map(row => (row.kind === 'item' ? row.item.id : ''))).toEqual(['c', 'a', 'b']);

    board.moveWork('b', { mode: 'inside', targetId: 'a' });
    expect(board.getBoard().items.find(entry => entry.id === 'b')?.parentId).toBe('a');
    expect(board.canDrop(board.getBoard(), 'a', { mode: 'inside', targetId: 'b' })).toBe(false);

    board.moveWork('a', { mode: 'section', sprintId: '' });
    expect(board.getBoard().items.filter(entry => !entry.sprintId).map(entry => entry.id).sort()).toEqual(['a', 'b']);
  });

  it('keeps each member once, and unassigns work when one is removed', async () => {
    const board = await openBoard();
    expect(board.addMember('Ana')).toBe('');
    expect(board.addMember('ana')).not.toBe('');
    board.replaceBoard({ ...board.getBoard(), items: [item('t', { assignee: 'Ana' })] });
    board.removeMember('Ana');
    expect(board.getBoard().items[0].assignee).toBe('');
    expect(board.getBoard().members).toEqual([]);
  });
});
