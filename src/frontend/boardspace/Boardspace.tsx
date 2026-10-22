import { useEffect, useRef } from 'react';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { TASKS } from '../../backend/data/sampleTasks';
import type { BoardTab, ProjectTab, StatusTab, Task } from '../../shared/types/task';
import { BOARD_TABS, isProjectTab, PROJECT_ICONS, TAB_DESCRIPTIONS } from './data';
import { Timeline } from './timeline/Timeline';
import { WorkList } from './list/WorkList';
import { WorkBoard } from './board/WorkBoard';
import { ProjectFrame } from './ProjectFrame';

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

/* Shared tabs for the status cards and the project's views (the list, board and timeline). */
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
        const isView = isProjectTab(item.id);
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`board-tab ${tab === item.id ? 'active' : ''}`}
            onClick={() => onTabChange(item.id)}
          >
            {isProjectTab(item.id) && <Icon name={PROJECT_ICONS[item.id]} size={16} />}
            {item.label}{' '}
            {!isView && <span className="tab-count">{TASKS[item.id as StatusTab].length}</span>}
          </button>
        );
      })}
    </div>
  );
}


/* =========================
   Boardspace Views
   ========================= */

/* The project's work as a list, a board or a Gantt timeline (list/WorkList.tsx, */
/* board/WorkBoard.tsx, timeline/Timeline.tsx), inside the project frame with its name, Create */
/* and More. */
const PROJECT_INTROS = {
  list: 'Every piece of work in the project, to sort and filter.',
  board: 'Features and tasks as cards, moved across a column for each status.',
  timeline: 'Plan sprints and see epics, features and tasks across the calendar.'
};

function ProjectView(props: BoardspaceProps & { tab: ProjectTab }) {
  return (
    <div className="content-pad board-page board-page--project">
      <div className="page-intro board-intro">
        <div>
          <h1>Boardspace</h1>
          <p>{PROJECT_INTROS[props.tab]}</p>
        </div>
      </div>

      <div className="board-panel">
        <BoardspaceTabs {...props} />
        <ProjectFrame>
          {edit => (props.tab === 'list' ? <WorkList onEdit={edit} /> : props.tab === 'board' ? <WorkBoard onEdit={edit} /> : <Timeline onEdit={edit} />)}
        </ProjectFrame>
      </div>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="metric"><span>{label}</span><strong>{String(value).padStart(2, '0')}</strong><small>{detail}</small></div>;
}

export function Boardspace(props: BoardspaceProps) {
  const tab = props.tab;
  if (isProjectTab(tab)) return <ProjectView {...props} tab={tab} />;

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
