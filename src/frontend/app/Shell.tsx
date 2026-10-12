import type { MouseEvent, ReactNode } from 'react';
import { BrandMark } from '../components/BrandMark';
import { Icon, type IconName } from '../components/Icon';
import { WORKSPACES, workspaceLabel, type WorkspaceId } from './workspaces';
import { useNotes } from '../notespace/store';
import { newestFirst } from '../notespace/NoteList';
import { BOARD_TABS } from '../workboard/data';
import { updatePreferences, usePreferences } from './preferences';
import type { Note } from '../../shared/types/note';
import type { BoardTab } from '../../shared/types/task';

type NavigationProps = {
  workspace: WorkspaceId;
  onNavigate: (workspace: WorkspaceId) => void;
};

/* The spaces the sidebar can show lists for (Settings is not one). */
export type SpaceId = Exclude<WorkspaceId, 'settings'>;

type SidebarProps = NavigationProps & {

  /* The space whose lists are shown: the current one, or the last one used while in Settings. */
  space: SpaceId;
  openNoteId: string | null;
  boardView: BoardTab | null;
  onOpenNote: (id: string) => void;
  onOpenBoardView: (view: BoardTab) => void;
  /* Docked beside the page, or floating over it as a popup. Docked, Home and the sidebar button */
  /* (controls) sit at its top. */
  docked: boolean;
  controls: ReactNode;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

/* How many notes each sidebar list shows. */
const LIST_COUNT = 5;



/* =========================
   Window Controls
   ========================= */

type WindowControlsProps = {
  sidebarOpen: boolean;
  onHome: () => void;
  onToggleSidebar: () => void;
  onSidebarHover: (event: MouseEvent) => void;
  onSidebarLeave: () => void;
  onNewNote: () => void;
};

/* Home, the sidebar button, Notifications and New note, always at the top left of the window: at */
/* the start of the tab bar (or of the top bar on screens without tabs), or across the top of the */
/* docked sidebar, where Notifications and New note move to its right end. Hovering the sidebar */
/* button opens the sidebar as a popup; clicking it docks or undocks the sidebar. */
export function WindowControls({ sidebarOpen, onHome, onToggleSidebar, onSidebarHover, onSidebarLeave, onNewNote }: WindowControlsProps) {
  return (
    <div className="window-controls">
      <button type="button" className="window-home" aria-label="Home" data-tooltip="Home" data-tooltip-align="start" onClick={onHome}>
        <BrandMark />
      </button>
      <button
        type="button"
        className="window-control sidebar-button"
        aria-label="Sidebar"
        aria-expanded={sidebarOpen}
        data-tooltip="Sidebar (Ctrl + \)"
        data-tooltip-align="start"
        onClick={onToggleSidebar}
        onMouseEnter={onSidebarHover}
        onMouseLeave={onSidebarLeave}
      >
        <Icon name="sidebar" size={17} />
      </button>
      <button
        type="button"
        className="window-control window-notifications"
        aria-label="Notifications (coming soon)"
        aria-disabled="true"
        data-tooltip="Notifications (coming soon)"
        data-tooltip-align="start"
      >
        <Icon name="bell" size={17} /><span className="notification-dot" />
      </button>
      <button type="button" className="window-control window-new-note" aria-label="New note" data-tooltip="New note" data-tooltip-align="start" onClick={onNewNote}>
        <Icon name="square-pen" size={17} />
      </button>
    </div>
  );
}


/* =========================
   Sidebar Lists
   ========================= */

type SidebarLinkProps = {
  icon: IconName | null;
  emoji?: string;
  label: string;
  current: boolean;
  onClick: () => void;
};

/* One line in a sidebar list: a note, or a view of the board. */
function SidebarLink({ icon, emoji, label, current, onClick }: SidebarLinkProps) {
  return (
    <li>
      <button type="button" className={`sidebar-link ${current ? 'is-current' : ''}`} aria-current={current ? 'page' : undefined} onClick={onClick}>
        {emoji ? <span className="sidebar-link-emoji" aria-hidden="true">{emoji}</span> : icon && <Icon name={icon} size={14} />}
        <span className="sidebar-link-label">{label}</span>
      </button>
    </li>
  );
}

type SidebarListProps = {
  id: string;
  title: string;
  empty: string;
  children: ReactNode[];
};

/* A titled list; with nothing in it, a short line says what will appear there. */
function SidebarList({ id, title, empty, children }: SidebarListProps) {
  return (
    <section className="sidebar-list" aria-labelledby={id}>
      <h3 id={id} className="sidebar-section-label">{title}</h3>
      {children.length ? <ul>{children}</ul> : <p className="sidebar-empty">{empty}</p>}
    </section>
  );
}

/* Notespace: starred notes, then the notes opened most recently. */
function NotespaceLists({ openNoteId, onOpenNote }: Pick<SidebarProps, 'openNoteId' | 'onOpenNote'>) {
  const notes = useNotes();
  const starred = newestFirst(notes).filter(note => note.pinned).slice(0, LIST_COUNT);
  const recent = notes
    .filter(note => note.openedAt)
    .sort((a, b) => (b.openedAt ?? '').localeCompare(a.openedAt ?? ''))
    .slice(0, LIST_COUNT);
  const link = (note: Note) => (
    <SidebarLink
      key={note.id}
      icon="file-text"
      emoji={note.icon}
      label={note.title || 'Untitled note'}
      current={openNoteId === note.id}
      onClick={() => onOpenNote(note.id)}
    />
  );

  return (
    <>
      <SidebarList id="sidebar-starred" title="Starred" empty="Star a note to keep it here.">{starred.map(link)}</SidebarList>
      <SidebarList id="sidebar-recent" title="Recent" empty="Notes you open appear here.">{recent.map(link)}</SidebarList>
    </>
  );
}

/* Workboard has one board for now, so its list is the board's views. */
function WorkboardLists({ boardView, onOpenBoardView }: Pick<SidebarProps, 'boardView' | 'onOpenBoardView'>) {
  return (
    <SidebarList id="sidebar-board" title="Board" empty="">
      {BOARD_TABS.map(view => (
        <SidebarLink
          key={view.id}
          icon={view.id === 'timeline' ? 'calendar-days' : 'check-square'}
          label={view.label}
          current={boardView === view.id}
          onClick={() => onOpenBoardView(view.id)}
        />
      ))}
    </SidebarList>
  );
}


/* =========================
   Sidebar
   ========================= */

/* Top to bottom: Search, the space icons, the space's lists, and a row of small buttons (Settings */
/* and the theme switch). The space whose lists are shown is named inside its icon, so it needs no */
/* heading. Docked, it sits beside the page at full height, with the window controls across its */
/* top. Otherwise it floats over the page as a popup below the note bar, opened by hovering the */
/* sidebar button or the left edge of the window, or by the keyboard moving into it. */
export function Sidebar({ workspace, space, openNoteId, boardView, docked, controls, onNavigate, onOpenNote, onOpenBoardView, onMouseEnter, onMouseLeave }: SidebarProps) {
  const { theme } = usePreferences();
  const dark = theme === 'dark';
  const spaces = WORKSPACES.filter(item => item.id !== 'settings');

  return (
    <aside className="sidebar" aria-label="Sidebar" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {docked && <div className="sidebar-top">{controls}</div>}

      {/* A text field rather than a button, so typing can start with one click. */}
      <div className="sidebar-search" role="search">
        <Icon name="search" size={16} />
        <input type="search" aria-label="Search (coming soon)" placeholder="Search…" readOnly />
      </div>

      <nav className="sidebar-icons" aria-label="Spaces">
        {spaces.map(item => (
          <button
            key={item.id}
            type="button"
            className={`sidebar-icon ${space === item.id ? 'is-active' : ''}`}
            aria-label={item.label}
            aria-current={workspace === item.id ? 'page' : undefined}
            data-tooltip={space === item.id ? undefined : item.label}
            onClick={() => onNavigate(item.id)}
          >
            <Icon name={item.icon} size={18} />
            {space === item.id && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      <nav className="sidebar-lists" aria-label={`${workspaceLabel(space)} shortcuts`}>
        {space === 'notes'
          ? <NotespaceLists openNoteId={openNoteId} onOpenNote={onOpenNote} />
          : <WorkboardLists boardView={boardView} onOpenBoardView={onOpenBoardView} />}
      </nav>

      <div className="sidebar-bottom">
        <button
          type="button"
          className={`sidebar-icon ${workspace === 'settings' ? 'is-active' : ''}`}
          aria-label="Settings"
          aria-current={workspace === 'settings' ? 'page' : undefined}
          data-tooltip="Settings"
          data-tooltip-side="above"
          data-tooltip-align="start"
          onClick={() => onNavigate('settings')}
        >
          <Icon name="settings" size={18} />
        </button>

        {/* Switches between light and dark mode; the choice is remembered, like the one in Settings. */}
        {/* It sits on the right, apart from Settings, so the two icons are not read as a pair. */}
        <button
          type="button"
          className="sidebar-icon sidebar-theme"
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          data-tooltip={dark ? 'Light mode' : 'Dark mode'}
          data-tooltip-side="above"
          data-tooltip-align="end"
          onClick={() => updatePreferences({ theme: dark ? 'light' : 'dark' })}
        >
          <Icon name={dark ? 'sun' : 'moon'} size={18} />
        </button>
      </div>
    </aside>
  );
}


/* =========================
   Mobile Navigation and Header
   ========================= */

export function MobileNav({ workspace, onNavigate }: NavigationProps) {
  return (
    <nav className="mobile-nav" aria-label="Mobile workspace navigation">
      {WORKSPACES.map(item => (
        <button
          key={item.id}
          type="button"
          className={`mobile-link ${workspace === item.id ? 'active' : ''}`}
          aria-current={workspace === item.id ? 'page' : undefined}
          onClick={() => onNavigate(item.id)}
        >
          <Icon name={item.icon} size={20} /><span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

/* Notespace keeps its breadcrumb in the document toolbar, so it has no separate header. Screens */
/* without a tab bar show Home and the sidebar button here (controls) instead. */
export function Topbar({ workspace, controls }: { workspace: WorkspaceId; controls: ReactNode }) {
  if (workspace === 'notes') return null;
  return (
    <header className="topbar">
      {controls}
      <div className="breadcrumbs"><span className="crumb-root">{workspaceLabel(workspace)}</span></div>
    </header>
  );
}
