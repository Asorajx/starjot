import { useEffect, useRef } from 'react';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { TASKS } from '../../backend/data/sampleTasks';
import type { BoardTab, StatusTab, Task } from '../../shared/types/task';
import { BOARD_TABS, TAB_DESCRIPTIONS } from './data';

type BoardspaceProps = {
  tab: BoardTab;
  onTabChange: (tab: BoardTab) => void;
};


/* =========================
   Work Item Cards
   ========================= */

function PriorityBadge({ priority }: { priority: Task['priority'] }) {
  return <span className={`priority priority--${priority.toLowerCase()}`}><span className="priority-mark" />{priority} priority</span>;
}

export function TaskCard({ task }: { task: Task }) {
  return (
    <article className="task-card">
      <div className="task-head"><span className="task-id">{task.id}</span><PriorityBadge priority={task.priority} /></div>
      <h3>{task.title}</h3>
      <p>{task.description}</p>
      <div className="task-tags">{task.tags.map(tag => <span key={tag} className="task-tag">{tag}</span>)}</div>
      <div className="task-link-row">
        <Icon name="link" size={15} />{' '}
        {task.linked.length ? (
          <>
            <span>{task.linked.length} linked {task.linked.length === 1 ? 'note' : 'notes'}</span>
            <span className="linked-note-name">{task.linked[0]}</span>
          </>
        ) : <span className="muted">No linked notes</span>}
      </div>
      <div className="task-bottom">
        <div className="assignee"><Avatar initials={task.assignee} className="avatar--task" /><span>{task.person}</span></div>
        <span className="task-due"><Icon name="calendar-days" size={14} /> {task.date}</span>
      </div>
    </article>
  );
}


/* =========================
   Boardspace Tabs
   ========================= */

/* Shared tabs for the status cards and the Gantt timeline. */
function BoardspaceTabs({ tab, onTabChange }: BoardspaceProps) {
  const tabBar = useRef<HTMLDivElement>(null);

  /* Keep the active tab visible on smaller screens, where the tab bar scrolls sideways. */
  useEffect(() => {
    const bar = tabBar.current;
    const selected = bar?.querySelector('.board-tab.active');
    if (!bar || !selected) return;
    const barBounds = bar.getBoundingClientRect();
    const tabBounds = selected.getBoundingClientRect();
    if (tabBounds.right > barBounds.right) bar.scrollLeft += tabBounds.right - barBounds.right + 12;
    else if (tabBounds.left < barBounds.left) bar.scrollLeft -= barBounds.left - tabBounds.left + 12;
  }, [tab]);

  return (
    <div className="board-tabs" role="tablist" aria-label="Boardspace views" ref={tabBar}>
      {BOARD_TABS.map(item => {
        const isTimeline = item.id === 'timeline';
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`board-tab ${tab === item.id ? 'active' : ''}`}
            onClick={() => onTabChange(item.id)}
          >
            {isTimeline && <Icon name="calendar-days" size={16} />}{item.label}{' '}
            {!isTimeline && <span className="tab-count">{TASKS[item.id as StatusTab].length}</span>}
          </button>
        );
      })}
    </div>
  );
}


/* =========================
   Boardspace Views
   ========================= */

/* The Gantt chart is a separate page in public/gantt, embedded so its scripts and styles stay isolated. */
function TimelineView(props: BoardspaceProps) {
  return (
    <div className="content-pad board-page board-page--timeline">
      <div className="page-intro board-intro">
        <div>
          <h1>Boardspace</h1>
          <p>View the schedule across sprints, epics, features, and tasks.</p>
        </div>
      </div>

      <div className="board-panel">
        <BoardspaceTabs {...props} />
        <section className="timeline-integration" aria-label="Project Gantt timeline">
          <iframe
            className="timeline-integration-frame"
            src={`${import.meta.env.BASE_URL}gantt/index.html?embed=1`}
            title="Editable Gantt timeline and sprint planner"
            loading="eager"
          />
          <p className="timeline-integration-note">
            <Icon name="info" size={15} /> The timeline saves changes in this browser. Boardspace's other tabs
            currently show sample cards and are not connected to these tasks yet.
          </p>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="metric"><span>{label}</span><strong>{String(value).padStart(2, '0')}</strong><small>{detail}</small></div>;
}

export function Boardspace(props: BoardspaceProps) {
  if (props.tab === 'timeline') return <TimelineView {...props} />;

  const tab = props.tab;
  const current = BOARD_TABS.find(item => item.id === tab) ?? BOARD_TABS[0];
  const total = Object.values(TASKS).reduce((sum, list) => sum + list.length, 0);

  return (
    <div className="content-pad board-page">
      <div className="page-intro board-intro">
        <div>
          <h1>Boardspace</h1>
          <p>A clear view of the work ahead, the work moving, and the work done.</p>
        </div>
      </div>

      <div className="board-metrics">
        <Metric label="ALL WORK ITEMS" value={total} detail="Across all stages" />
        <Metric label="TO DO" value={TASKS.todo.length} detail="Ready to start" />
        <Metric label="IN PROGRESS" value={TASKS.progress.length} detail="Actively underway" />
        <Metric label="COMPLETED" value={TASKS.done.length} detail="Marked done" />
      </div>

      <div className="board-panel">
        <BoardspaceTabs {...props} />
        <div className="board-panel-content">
          <div className="board-section-head">
            <div>
              <h2>{current.label} <span className={`work-status-dot work-status-dot--${tab}`} /></h2>
              <p>{TAB_DESCRIPTIONS[tab]}</p>
            </div>
            {tab === 'todo' && <button className="btn btn-primary" type="button"><Icon name="plus" size={17} /> Create Work Item</button>}
          </div>
          <div className="task-grid">{TASKS[tab].map(task => <TaskCard key={task.id} task={task} />)}</div>
          <div className="board-bottom-note">
            <Icon name="info" size={15} /> This is a visual-only board. Work items and note links use placeholder content; no creation, movement, or updates are implemented.
          </div>
        </div>
      </div>
    </div>
  );
}
