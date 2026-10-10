import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { WORKSPACES, workspaceLabel, type WorkspaceId } from './workspaces';
import { useNotes } from '../notespace/store';
import { updatePreferences, usePreferences } from './preferences';

type NavigationProps = {
  workspace: WorkspaceId;
  onNavigate: (workspace: WorkspaceId) => void;
};

type SidebarProps = NavigationProps & {
  openNoteId: string | null;
  onOpenNote: (id: string) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};


/* =========================
   Sidebar
   ========================= */

/* When the sidebar is hidden it can still slide in over the page; its button then keeps it open. */
export function Sidebar({ workspace, openNoteId, onNavigate, onOpenNote, onMouseEnter, onMouseLeave }: SidebarProps) {
  const pinned = useNotes().filter(note => note.pinned).slice(0, 3);
  const { theme, sidebarCollapsed } = usePreferences();

  return (
    <aside className="sidebar" aria-label="Main navigation" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div className="brand">
        <span className="brand-mark"><span /><span /><span /></span>
        <span className="brand-words">starjot<span className="brand-point">.</span></span>
        <span className="brand-preview">PREVIEW</span>
        <button
          type="button"
          className={`sidebar-toggle ${sidebarCollapsed ? 'is-collapsed' : ''}`}
          aria-label={sidebarCollapsed ? 'Keep sidebar open' : 'Hide sidebar'}
          aria-pressed={!sidebarCollapsed}
          onClick={() => updatePreferences({ sidebarCollapsed: !sidebarCollapsed })}
        >
          <Icon name="sidebar" size={17} />
        </button>
      </div>
      <div className="sidebar-workspace">
        <span className="team-icon">S</span>
        <span className="team-name"><strong>Studio workspace</strong><small>Personal space</small></span>
        <Icon name="chevron-down" size={14} className="team-chevron" />
      </div>
      <div className="sidebar-search" role="search">
        <Icon name="search" size={17} />
        <input type="search" aria-label="Search workspace (coming soon)" placeholder="Search workspace…" readOnly />
      </div>

      <div className="sidebar-section-label">WORKSPACES</div>
      <nav className="primary-nav" aria-label="Workspaces">
        {WORKSPACES.map(item => (
          <button
            key={item.id}
            type="button"
            className={`nav-item ${workspace === item.id ? 'active' : ''}`}
            aria-current={workspace === item.id ? 'page' : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <Icon name={item.icon} size={19} /><span>{item.label}</span>
            {workspace === item.id && <span className="nav-active-indicator" />}
          </button>
        ))}
      </nav>

      <div className="sidebar-section-label sidebar-section-label--second">QUICK ACCESS</div>
      <div className="quick-access">
        <button className="quick-label" type="button" onClick={() => onNavigate('notes')}><Icon name="star" size={16} /><span>Starred notes</span></button>
        {pinned.map(note => (
          <button key={note.id} type="button" className={`quick-note ${openNoteId === note.id ? 'quick-note--active' : ''}`} onClick={() => onOpenNote(note.id)}>
            <span className={`quick-dot quick-dot--${note.accent}`} /><span>{note.title}</span>
          </button>
        ))}
      </div>

      <div className="sidebar-spacer" />
      <div className="sidebar-bottom">
        <div className="sidebar-bottom-helper"><Icon name="circle-help" size={17} /> <span>Windows-first · Browser preview</span></div>
        <button
          className="sidebar-notifications sidebar-theme-toggle"
          type="button"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={() => updatePreferences({ theme: theme === 'dark' ? 'light' : 'dark' })}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} /><span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>
        <button className="sidebar-notifications" type="button" aria-label="Notifications (coming soon)">
          <Icon name="bell" size={17} /><span>Notifications</span><span className="notification-dot" />
        </button>
        <div className="profile">
          <Avatar initials="SC" className="avatar--profile" />
          <span className="profile-info"><strong>Studio Collective</strong><small>Workspace admin</small></span>
          <Icon name="more-horizontal" size={17} />
        </div>
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

/* Notespace keeps its breadcrumb in the document toolbar, so it has no separate header. */
export function Topbar({ workspace }: { workspace: WorkspaceId }) {
  if (workspace === 'notes') return null;
  return <header className="topbar"><div className="breadcrumbs"><span className="crumb-root">{workspaceLabel(workspace)}</span></div></header>;
}
