import { useMemo, type ReactNode } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import type { WorkItem } from '../../../shared/types/board';
import { useBoard } from '../board';
import { dayRange, shortDay } from '../dates';
import { initialsOf, WORK_STATUSES } from '../workItems';
import type { EditorTarget } from '../WorkEditor';
import { Progress, WorkTypeIcon } from '../workParts';
import { DUE_SOON_DAYS, projectSummary, type Completion } from './summaryStats';

const percentOf = (count: number, total: number) => (total ? Math.round((count / total) * 100) : 0);
const tasksLabel = (completion: Completion) => (completion.total ? `${completion.done} of ${completion.total} tasks done` : 'No tasks yet');


/* =========================
   Project Summary
   ========================= */

/* The project at a glance, like Jira's summary: headline numbers, the work by status, each */
/* sprint's and epic's progress, what is overdue or due soon, and how the work is shared out. */
/* Numbers count features and tasks (epics have no status of their own); progress counts tasks, */
/* as on the timeline. A due item opens the editor. */
export function ProjectSummary({ onEdit }: { onEdit: (target: EditorTarget) => void }) {
  const board = useBoard();
  const summary = useMemo(() => projectSummary(board), [board]);
  const count = (status: keyof typeof WORK_STATUSES) => summary.byStatus.find(entry => entry.status === status)?.count ?? 0;

  if (!board.items.length) {
    return (
      <section className="project-summary" aria-label="Summary">
        <div className="work-list-empty">
          <Icon name="layout-dashboard" size={28} />
          <h3>No work yet.</h3>
          <p>Once the project has work, its progress, due dates and team show here.</p>
          <button type="button" className="btn btn-primary" onClick={() => onEdit({ kind: 'item', type: 'task' })}><Icon name="plus" size={16} /> Add a task</button>
        </div>
      </section>
    );
  }

  const busiest = Math.max(1, ...summary.people.map(person => person.open));
  return (
    <section className="project-summary" aria-label="Summary">
      <div className="summary-tiles">
        <Tile label="Work items" value={summary.total} detail="Features and tasks" />
        <Tile label="Tasks done" value={`${summary.tasks.percent}%`} detail={tasksLabel(summary.tasks)} />
        <Tile label="In progress" value={count('progress')} detail={`${count('review')} more in review`} />
        <Tile label="Overdue" value={summary.overdue.length} detail={summary.overdue.length ? 'Past due and not done' : 'Nothing late'} alert={summary.overdue.length > 0} />
      </div>

      <div className="summary-grid">
        <Panel title="Status" detail={`${summary.total} features and tasks`}>
          {summary.total > 0 && (
            <div className="summary-stack" role="img" aria-label={summary.byStatus.map(entry => `${WORK_STATUSES[entry.status]} ${entry.count}`).join(', ')}>
              {summary.byStatus.filter(entry => entry.count).map(entry => (
                <span
                  key={entry.status}
                  className={`summary-segment is-${entry.status}`}
                  style={{ flexGrow: entry.count }}
                  data-tooltip={`${WORK_STATUSES[entry.status]}: ${entry.count} (${percentOf(entry.count, summary.total)}%)`}
                />
              ))}
            </div>
          )}
          <ul className="summary-legend">
            {summary.byStatus.map(entry => (
              <li key={entry.status}>
                <span className={`work-status-dot work-status-dot--${entry.status}`} />
                <span className="summary-legend-name">{WORK_STATUSES[entry.status]}</span>
                <strong>{entry.count}</strong>
                <span className="summary-muted">{percentOf(entry.count, summary.total)}%</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Due dates" detail={`Overdue, and due in the next ${DUE_SOON_DAYS} days`}>
          {!summary.overdue.length && !summary.dueSoon.length && <p className="summary-none">Nothing overdue or due soon.</p>}
          {summary.overdue.length > 0 && <DueList title="Overdue" items={summary.overdue} overdue onEdit={onEdit} />}
          {summary.dueSoon.length > 0 && <DueList title="Due soon" items={summary.dueSoon} onEdit={onEdit} />}
        </Panel>

        <Panel title="Sprints" detail="Tasks done in each sprint">
          {!summary.sprints.length && <p className="summary-none">No sprints yet.</p>}
          <ul className="summary-rows">
            {summary.sprints.map(({ sprint, completion, current }) => (
              <li key={sprint.id}>
                <div className="summary-row-head">
                  <span className="summary-row-name">{sprint.name}</span>
                  {current && <span className="summary-chip">Current</span>}
                  <span className="summary-muted">{dayRange(sprint.start, sprint.end)}</span>
                </div>
                <Progress percent={completion.percent} label={tasksLabel(completion)} />
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Epics" detail="Tasks done inside each epic">
          {!summary.epics.length && <p className="summary-none">No epics yet.</p>}
          <ul className="summary-rows">
            {summary.epics.map(({ epic, completion }) => (
              <li key={epic.id}>
                <div className="summary-row-head">
                  <WorkTypeIcon type="epic" />
                  <button type="button" className="summary-link" onClick={() => onEdit({ kind: 'item', id: epic.id })}>{epic.name}</button>
                </div>
                <Progress percent={completion.percent} label={tasksLabel(completion)} />
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Team" detail="Open work for each person">
          <ul className="summary-rows">
            {summary.people.map(person => (
              <li key={person.name || 'nobody'} className="summary-person">
                <Avatar initials={person.name ? initialsOf(person.name) : '–'} className={`work-avatar ${person.name ? '' : 'is-nobody'}`} />
                <span className="summary-row-name">{person.name || 'Unassigned'}</span>
                <span className="summary-bar" data-tooltip={`${person.open} open, ${person.done} done`}>
                  <b style={{ width: `${(person.open / busiest) * 100}%` }} />
                </span>
                <span className="summary-muted summary-person-count">{person.open} open · {person.done} done</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </section>
  );
}

function Tile({ label, value, detail, alert = false }: { label: string; value: number | string; detail: string; alert?: boolean }) {
  return (
    <div className={`summary-tile ${alert ? 'is-alert' : ''}`}>
      <span className="summary-tile-label">{alert && <Icon name="alert-triangle" size={14} />}{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function Panel({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return (
    <section className="summary-panel" aria-label={title}>
      <h3>{title}</h3>
      <p className="summary-muted">{detail}</p>
      {children}
    </section>
  );
}

/* Due work, earliest first: its kind and name (opening the editor), due date and assignee. */
function DueList({ title, items, overdue = false, onEdit }: { title: string; items: WorkItem[]; overdue?: boolean; onEdit: (target: EditorTarget) => void }) {
  return (
    <div className="summary-due">
      <h4 className={overdue ? 'is-overdue' : ''}>{overdue && <Icon name="alert-triangle" size={13} />}{title}</h4>
      <ul className="summary-due-list">
        {items.map(item => (
          <li key={item.id}>
            <WorkTypeIcon type={item.type} />
            <button type="button" className="summary-link" onClick={() => onEdit({ kind: 'item', id: item.id })}>{item.name}</button>
            <span className={`summary-due-date ${overdue ? 'is-overdue' : ''}`}>{shortDay(item.end)}</span>
            <Avatar initials={item.assignee ? initialsOf(item.assignee) : '–'} className={`work-avatar ${item.assignee ? '' : 'is-nobody'}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}
