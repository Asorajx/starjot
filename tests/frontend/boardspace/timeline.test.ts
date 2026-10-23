import { describe, expect, it } from 'vitest';
import { dayTicks, draggedDates, monthBands, timelineScale, widthOf, xOf } from '../../../src/frontend/boardspace/timeline/scale';
import { csvDay, csvProject, projectCsv, timelineSvg } from '../../../src/frontend/boardspace/files';
import type { BoardProject } from '../../../src/shared/types/board';

const PROJECT: BoardProject = {
  version: 5,
  title: 'Launch',
  members: ['Ana'],
  sprints: [{ id: 's1', name: 'Sprint 1', start: '2026-10-05', end: '2026-10-16', order: 0 }],
  items: [
    { id: 'e', name: 'Website', type: 'epic', parentId: '', sprintId: 's1', status: 'todo', assignee: '', start: '2026-10-05', end: '2026-10-16', color: '#8a72e7', progress: 0, manualBacklog: false, order: 0 },
    { id: 't', name: '=Write copy', type: 'task', parentId: 'e', sprintId: 's1', status: 'done', assignee: 'Ana', start: '2026-10-05', end: '2026-10-07', color: '#4e82f7', progress: 100, manualBacklog: false, order: 1 }
  ],
  collapsedSprints: {},
  collapsedItems: {},
  collapsedCards: {}
};


/* =========================
   Scale
   ========================= */

describe('timeline scale', () => {
  it('spans from two weeks before the earliest date, on whole weeks', () => {
    const scale = timelineScale(PROJECT, 'week', '2026-10-05');
    expect(scale.start.getDay()).toBe(1);
    expect(xOf(scale, '2026-10-05')).toBe(14 * 22);
    expect(widthOf(scale, '2026-10-05', '2026-10-07')).toBe(3 * 22);
  });

  it('labels months and marks the tick holding today', () => {
    const scale = timelineScale(PROJECT, 'day', '2026-10-08');
    expect(monthBands(scale).map(band => band.key)).toContain('2026-10-01');
    expect(dayTicks(scale, '2026-10-08').filter(tick => tick.current).map(tick => tick.key)).toEqual(['2026-10-08']);
  });

  it('snaps dragged bars to days, weeks or months, and never past the other end', () => {
    const week = timelineScale(PROJECT, 'week', '2026-10-05');
    expect(draggedDates('move', '2026-10-05', '2026-10-07', 22 * 7 + 10, week)).toEqual({ start: '2026-10-12', end: '2026-10-14' });
    expect(draggedDates('start', '2026-10-05', '2026-10-07', 22 * 14, week)).toEqual({ start: '2026-10-07', end: '2026-10-07' });
    const month = timelineScale(PROJECT, 'month', '2026-10-05');
    expect(draggedDates('end', '2026-10-05', '2026-10-31', 7.5 * 31, month)).toEqual({ start: '2026-10-05', end: '2026-11-30' });
  });
});


/* =========================
   Files
   ========================= */

describe('timeline files', () => {
  it('reads the day formats spreadsheets write', () => {
    expect(csvDay('2026-10-05')).toBe('2026-10-05');
    expect(csvDay('5/10/2026')).toBe('2026-10-05');
    expect(csvDay('10/25/2026')).toBe('2026-10-25');
    expect(csvDay('5 Oct 2026')).toBe('2026-10-05');
    expect(csvDay('Oct 5, 2026')).toBe('2026-10-05');
    expect(csvDay('46300')).toBe('2026-10-05');
    expect(csvDay('')).toBe('');
    expect(csvDay('soon')).toBeNull();
  });

  it('exports a CSV that imports back to the same project, with formulas made safe', () => {
    const csv = projectCsv(PROJECT);
    expect(csv).toContain("'=Write copy");
    const back = csvProject(csv, 'Launch.csv');
    expect(back.sprints).toBe(1);
    expect(back.project.items.map(item => [item.name, item.type, item.parentId, item.status, item.assignee])).toEqual([
      ['Website', 'epic', '', 'todo', ''],
      ['=Write copy', 'task', 'e', 'done', 'Ana']
    ]);
  });

  it('imports a Jira-style CSV, giving work without dates its sprint\'s dates', () => {
    const csv = 'Summary,Issue Type,Issue key,Sprint,Status,Due date\nLogin,Story,K-1,Sprint A,In Progress,\nFix bug,Bug,K-2,Sprint A,Closed,2026-10-09\n';
    const result = csvProject(csv, 'jira.csv');
    expect(result.project.sprints.map(sprint => sprint.name)).toEqual(['Sprint A']);
    expect(result.project.items.map(item => [item.name, item.type, item.status])).toEqual([['Login', 'feature', 'progress'], ['Fix bug', 'task', 'done']]);
    expect(result.guessed).toBe(2);
    expect(() => csvProject('Colour,Size\nred,big\n', 'x.csv')).toThrow(/Name or Summary/);
  });

  it('draws the timeline as an SVG picture', () => {
    const { markup, width, height } = timelineSvg(PROJECT);
    expect(markup.startsWith('<svg')).toBe(true);
    expect(markup).toContain('Website');
    expect(markup).toContain('100%');
    expect(width).toBeGreaterThan(386);
    expect(height).toBeGreaterThanOrEqual(172);
  });
});
