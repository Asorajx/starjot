import type { MouseEvent, ReactNode } from 'react';
import { BrandMark } from '../components/BrandMark';
import { opensNewTab, type OpenById } from '../lib/clicks';
import { Icon, type IconName } from '../components/Icon';
import { enabledScreens, screenLabel, type ScreenId } from './screens';
import { noteTitle, useCategories, useNotes } from '../notespace/store';
import { sortNotes, starredNotes } from '../notespace/NoteList';
import { BOARD_TABS } from '../boardspace/data';
import { updatePreferences, usePreferences } from './preferences';
import type { Note } from '../../shared/types/note';
import type { BoardTab } from '../../shared/types/task';

type NavigationProps = {
  screen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
};

type SidebarProps = NavigationProps & {

  /* The space whose lists are shown (the one open). */
  space: ScreenId;
  openNoteId: string | null;
  openCategoryId: string | null;
  boardView: BoardTab | null;
  onOpenNote: OpenById;
  onOpenCategory: OpenById;
  onOpenBoardView: (view: BoardTab) => void;
  /* Docked beside the page, or floating over it as a popup. Docked, Home and the sidebar button */
  /* (controls) sit at its top. */
  docked: boolean;
  controls: ReactNode;

  /* Opens the search window, starting with any text already typed. */
  onSearch: (query: string) => void;

  /* Settings opens as a panel; its button is marked while it is open. */
  settingsOpen: boolean;
  onSettings: () => void;
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

  /* Left out while Notespace is turned off, which hides the New note button. */
  onNewNote?: () => void;
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
      {onNewNote && (
        <button type="button" className="window-control window-new-note" aria-label="New note" data-tooltip="New note" data-tooltip-align="start" onClick={onNewNote}>
          <Icon name="square-pen" size={17} />
        </button>
      )}
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
  onClick: (event: MouseEvent) => void;
};

/* One line in a sidebar list: a note, a category, or a view of the board. */
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

/* Notespace: starred notes, the notes opened most recently, and categories, each as chosen in */
/* Settings → Notes → Sidebar. */
function NotespaceLists({ openNoteId, openCategoryId, onOpenNote, onOpenCategory }: Pick<SidebarProps, 'openNoteId' | 'openCategoryId' | 'onOpenNote' | 'onOpenCategory'>) {
  const notes = useNotes();
  const categories = useCategories();
  const { sidebar } = usePreferences();
  const starred = starredNotes(notes).slice(0, LIST_COUNT);
  const recent = sortNotes(notes.filter(note => note.openedAt), 'opened').slice(0, LIST_COUNT);
  const shownCategories = categories.filter(category => !sidebar.hiddenCategories.includes(category.id));
  const link = (note: Note) => (
    <SidebarLink
      key={note.id}
      icon="file-text"
      emoji={note.icon}
      label={noteTitle(note)}
      current={openNoteId === note.id}
      onClick={event => onOpenNote(note.id, opensNewTab(event))}
    />
  );

  return (
    <>
      {sidebar.starred && <SidebarList id="sidebar-starred" title="Starred" empty="Star a note to keep it here.">{starred.map(link)}</SidebarList>}
      {sidebar.recent && <SidebarList id="sidebar-recent" title="Recent" empty="Notes you open appear here.">{recent.map(link)}</SidebarList>}
      {sidebar.categories && (
        <SidebarList id="sidebar-categories" title="Categories" empty="Choose categories to show in Settings → Notes.">
          {shownCategories.map(category => (
            <SidebarLink
              key={category.id}
              icon="folder"
              label={category.name}
              current={openCategoryId === category.id}
              onClick={event => onOpenCategory(category.id, opensNewTab(event))}
            />
          ))}
        </SidebarList>
      )}
    </>
  );
}

/* Boardspace has one board for now, so its list is the board's views. */
function BoardspaceLists({ boardView, onOpenBoardView }: Pick<SidebarProps, 'boardView' | 'onOpenBoardView'>) {
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
export function Sidebar({ screen, space, openNoteId, openCategoryId, boardView, docked, controls, settingsOpen, onNavigate, onOpenNote, onOpenCategory, onOpenBoardView, onSearch, onSettings, onMouseEnter, onMouseLeave }: SidebarProps) {
  const { theme, spaces: enabled } = usePreferences();
  const dark = theme === 'dark';
  const spaces = enabledScreens(enabled);

  /* Starjot Home sits in the tabs, so it counts as Notespace; with Notespace turned off, the */
  /* sidebar shows the space that is on instead. */
  const shown = enabled[space] ? space : spaces[0].id;

  return (
    <aside className="sidebar" aria-label="Sidebar" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {docked && <div className="sidebar-top">{controls}</div>}

      {/* A text field rather than a button, so typing can start straight away: clicking it, or */}
      {/* typing into it, opens the search window with what was typed. */}
      <div className="sidebar-search" role="search">
        <Icon name="search" size={16} />
        <input
          type="search"
          aria-label="Search (Ctrl + K)"
          placeholder="Search…"
          readOnly
          onClick={() => onSearch('')}
          onKeyDown={event => {
            const typed = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
            if (!typed && event.key !== 'Enter') return;
            event.preventDefault();
            onSearch(typed ? event.key : '');
          }}
        />
        <kbd className="sidebar-search-key">Ctrl K</kbd>
      </div>

      <nav className="sidebar-icons" aria-label="Spaces">
        {spaces.map(item => (
          <button
            key={item.id}
            type="button"
            className={`sidebar-icon ${shown === item.id ? 'is-active' : ''}`}
            aria-label={item.label}
            aria-current={screen === item.id ? 'page' : undefined}
            data-tooltip={shown === item.id ? undefined : item.label}
            onClick={() => onNavigate(item.id)}
          >
            <Icon name={item.icon} size={18} />
            {shown === item.id && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      <nav className="sidebar-lists" aria-label={`${screenLabel(shown)} shortcuts`}>
        {shown === 'notes'
          ? <NotespaceLists openNoteId={openNoteId} openCategoryId={openCategoryId} onOpenNote={onOpenNote} onOpenCategory={onOpenCategory} />
          : <BoardspaceLists boardView={boardView} onOpenBoardView={onOpenBoardView} />}
      </nav>

      <div className="sidebar-bottom">
        <button
          type="button"
          className={`sidebar-icon ${settingsOpen ? 'is-active' : ''}`}
          aria-label="Settings"
          aria-expanded={settingsOpen}
          data-tooltip="Settings"
          data-tooltip-side="above"
          data-tooltip-align="start"
          onClick={onSettings}
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

type MobileNavProps = NavigationProps & {

  /* Starjot Home is shown in a Notespace tab, so it is marked instead of Notespace while open. */
  homeShown: boolean;
  settingsOpen: boolean;
  onHome: () => void;
  onSearch: () => void;
  onSettings: () => void;
};

/* Phones have no sidebar: Home and the spaces turned on sit in a bar along the bottom. */
export function MobileNav({ screen, homeShown, settingsOpen, onNavigate, onHome, onSearch, onSettings }: MobileNavProps) {
  const { spaces } = usePreferences();
  const current = (id: ScreenId) => screen === id && !homeShown;
  return (
    <nav className="mobile-nav" aria-label="Spaces">
      <button type="button" className={`mobile-link ${homeShown ? 'active' : ''}`} aria-current={homeShown ? 'page' : undefined} onClick={onHome}>
        <Icon name="home" size={20} /><span>Home</span>
      </button>
      {enabledScreens(spaces).map(item => (
        <button
          key={item.id}
          type="button"
          className={`mobile-link ${current(item.id) ? 'active' : ''}`}
          aria-current={current(item.id) ? 'page' : undefined}
          onClick={() => onNavigate(item.id)}
        >
          <Icon name={item.icon} size={20} /><span>{item.label}</span>
        </button>
      ))}
      <button type="button" className="mobile-link" onClick={onSearch}>
        <Icon name="search" size={20} /><span>Search</span>
      </button>
      <button
        type="button"
        className={`mobile-link ${settingsOpen ? 'active' : ''}`}
        aria-expanded={settingsOpen}
        onClick={onSettings}
      >
        <Icon name="settings" size={20} /><span>Settings</span>
      </button>
    </nav>
  );
}

/* Notespace keeps its breadcrumb in the document toolbar, so it has no separate header. Screens */
/* without a tab bar show Home and the sidebar button here (controls) instead. */
export function Topbar({ screen, controls }: { screen: ScreenId; controls: ReactNode }) {
  if (screen === 'notes') return null;
  return (
    <header className="topbar">
      {controls}
      <div className="breadcrumbs"><span className="crumb-root">{screenLabel(screen)}</span></div>
    </header>
  );
}
