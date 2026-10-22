import { useEffect, useRef } from 'react';
import { Icon } from '../components/Icon';
import type { BoardTab } from '../../shared/types/board';
import { BOARD_ICONS, BOARD_TABS } from './data';
import { Timeline } from './timeline/Timeline';
import { WorkList } from './list/WorkList';
import { WorkBoard } from './board/WorkBoard';
import { ProjectSummary } from './summary/ProjectSummary';
import { ProjectFrame } from './ProjectFrame';

type BoardspaceProps = {
  tab: BoardTab;
  onTabChange: (tab: BoardTab) => void;

  /* Opens a note in a new tab, from a work item's linked notes. */
  onOpenNote?: (noteId: string) => void;
};


/* =========================
   Boardspace Tabs
   ========================= */

/* The tabs for the project's views: summary, list, board and timeline. */
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
      {BOARD_TABS.map(item => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={tab === item.id}
          className={`board-tab ${tab === item.id ? 'active' : ''}`}
          onClick={() => onTabChange(item.id)}
        >
          <Icon name={BOARD_ICONS[item.id]} size={16} />
          {item.label}
        </button>
      ))}
    </div>
  );
}


/* =========================
   Boardspace
   ========================= */

/* The project's work as a summary, a list, a board or a Gantt timeline (summary/, list/, */
/* board/ and timeline/), inside the project frame with its name, Create and More. */
const VIEWS = { summary: ProjectSummary, list: WorkList, board: WorkBoard, timeline: Timeline };

const INTROS = {
  summary: 'The project at a glance: progress, due dates and who is doing what.',
  list: 'Every piece of work in the project, to sort and filter.',
  board: 'Features and tasks as cards, moved across a column for each status.',
  timeline: 'Plan sprints and see epics, features and tasks across the calendar.'
};

export function Boardspace(props: BoardspaceProps) {
  /* A view that no longer exists (a page left open across an update) shows the summary. */
  const tab = VIEWS[props.tab] ? props.tab : 'summary';
  const View = VIEWS[tab];
  return (
    <div className="content-pad board-page">
      <div className="page-intro board-intro">
        <div>
          <h1>Boardspace</h1>
          <p>{INTROS[tab]}</p>
        </div>
      </div>

      <div className="board-panel">
        <BoardspaceTabs {...props} />
        <ProjectFrame onOpenNote={props.onOpenNote}>{edit => <View onEdit={edit} />}</ProjectFrame>
      </div>
    </div>
  );
}
