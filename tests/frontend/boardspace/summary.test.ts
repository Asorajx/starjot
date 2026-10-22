import { describe, expect, it } from 'vitest';
import { projectSummary } from '../../../src/frontend/boardspace/summary/summaryStats';
import type { BoardProject, WorkItem } from '../../../src/shared/types/board';

function item(id: string, fields: Partial<WorkItem> = {}): WorkItem {
  return { id, name: id, type: 'task', parentId: '', sprintId: 's1', status: 'todo', assignee: '', start: '2026-10-05', end: '2026-10-30', color: '#4e82f7', progress: 0, manualBacklog: false, order: 0, ...fields };
}

const PROJECT: BoardProject = {
  version: 5,
  title: 'Test',
  members: ['Ana', 'Bo', 'Cy'],
  sprints: [
    { id: 's2', name: 'Sprint 2', start: '2026-10-19', end: '2026-10-30', order: 1 },
    { id: 's1', name: 'Sprint 1', start: '2026-10-05', end: '2026-10-16', order: 0 }
  ],
  items: [
    item('epic', { type: 'epic', order: 0 }),
    item('feature', { type: 'feature', parentId: 'epic', status: 'progress', order: 1 }),
    item('late', { parentId: 'feature', assignee: 'Ana', end: '2026-10-20', order: 2 }),
    item('soon', { parentId: 'feature', assignee: 'Ana', end: '2026-10-25', order: 3 }),
    item('done', { parentId: 'epic', status: 'done', assignee: 'Bo', end: '2026-10-01', order: 4 }),
    item('later', { sprintId: 's2', status: 'blocked', assignee: 'Dee', end: '2026-11-20', order: 5 })
  ],
  collapsedSprints: {},
  collapsedItems: {}
};

const summary = projectSummary(PROJECT, '2026-10-22');


/* =========================
   Summary Numbers
   ========================= */

describe('project summary', () => {
  it('counts features and tasks by status, leaving epics out', () => {
    expect(summary.total).toBe(5);
    expect(summary.byStatus.map(entry => `${entry.status} ${entry.count}`)).toEqual(['todo 2', 'progress 1', 'review 0', 'done 1', 'blocked 1']);
    expect(summary.tasks).toEqual({ done: 1, total: 4, percent: 25 });
  });

  it('lists overdue work and work due within a week, earliest first, never done work', () => {
    expect(summary.overdue.map(entry => entry.id)).toEqual(['late']);
    expect(summary.dueSoon.map(entry => entry.id)).toEqual(['soon']);
  });

  it("gives each sprint's and epic's task progress, marking the sprint today falls in", () => {
    expect(summary.sprints.map(entry => `${entry.sprint.id} ${entry.completion.percent} ${entry.current}`)).toEqual(['s1 33 false', 's2 0 true']);
    expect(summary.epics.map(entry => `${entry.epic.id} ${entry.completion.done}/${entry.completion.total}`)).toEqual(['epic 1/3']);
  });

  it('shares out the work per person, busiest first, with unassigned work last', () => {
    expect(summary.people).toEqual([
      { name: 'Ana', open: 2, done: 0 },
      { name: 'Dee', open: 1, done: 0 },
      { name: 'Bo', open: 0, done: 1 },
      { name: 'Cy', open: 0, done: 0 },
      { name: '', open: 1, done: 0 }
    ]);
  });
});
