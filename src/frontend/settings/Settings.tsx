import type { CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { usePreferences } from '../app/preferences';

export type SettingsSection = 'general' | 'appearance' | 'workspace' | 'storage' | 'about';

type SettingsProps = {
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
};

/* Settings menu labels and icons; every option on these pages is display-only. */
export const SETTING_TABS: { id: SettingsSection; label: string; icon: IconName }[] = [
  { id: 'general', label: 'General', icon: 'sliders-horizontal' },
  { id: 'appearance', label: 'Appearance', icon: 'palette' },
  { id: 'workspace', label: 'Workspace', icon: 'panels-top-left' },
  { id: 'storage', label: 'Storage', icon: 'hard-drive' },
  { id: 'about', label: 'About', icon: 'info' }
];


/* =========================
   Settings Building Blocks
   ========================= */

function Toggle({ on = true }: { on?: boolean }) {
  return <span className={`preview-switch ${on ? 'preview-switch--on' : ''}`} aria-hidden="true"><span /></span>;
}

function Row({ title, description, children }: { title: ReactNode; description: string; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-row-text"><strong>{title}</strong><p>{description}</p></div>
      <div className="setting-value">{children}</div>
    </div>
  );
}

function Group({ title, children }: { title: ReactNode; children: ReactNode }) {
  return <div className="settings-group"><div className="settings-group-title">{title}</div>{children}</div>;
}

function FakeSelect({ children }: { children: ReactNode }) {
  return <span className="fake-select">{children} <Icon name="chevron-down" size={14} /></span>;
}


/* =========================
   Settings Panels
   ========================= */

function SettingsPanel({ section }: { section: SettingsSection }) {
  const { theme } = usePreferences();

  if (section === 'general') {
    return (
      <>
        <h2>General</h2>
        <p className="settings-panel-subtitle">A few everyday preferences for your workspace.</p>
        <Group title="Application preferences">
          <Row title="Workspace name" description="The name shown in your navigation."><span className="fake-field">Studio workspace</span></Row>
          <Row title="Start page" description="Choose where the application opens by default."><FakeSelect>Notespace</FakeSelect></Row>
          <Row title="Show helpful tips" description="Show small hints while you explore the workspace."><Toggle /></Row>
        </Group>
        <Group title="Workspace preferences">
          <Row title="Default note view" description="New notes start as continuous documents."><FakeSelect>Continuous</FakeSelect></Row>
          <Row title="Show recent notes" description="Display your recently edited documents on Notespace home."><Toggle /></Row>
        </Group>
      </>
    );
  }

  if (section === 'appearance') {
    return (
      <>
        <h2>Appearance</h2>
        <p className="settings-panel-subtitle">The little details that make a workspace feel like yours.</p>
        <Group title="Interface">
          <Row title="Theme" description="Switch between light and dark with the button in the sidebar."><FakeSelect><Icon name={theme === 'dark' ? 'moon' : 'sun'} size={15} /> {theme === 'dark' ? 'Dark' : 'Light'}</FakeSelect></Row>
          <Row title="Interface density" description="Adjust spacing for a more spacious or compact layout.">
            <div className="fake-segment"><span className="chosen">Comfortable</span><span>Compact</span></div>
          </Row>
          <Row title="Accent color" description="Blue is the current application accent.">
            {/* --dot is a CSS variable that sets each colour swatch. */}
            <div className="color-options">
              <span className="color-dot selected-color" style={{ '--dot': '#3976ed' } as CSSProperties} />
              <span className="color-dot" style={{ '--dot': '#7c6be6' } as CSSProperties} />
              <span className="color-dot" style={{ '--dot': '#14a38b' } as CSSProperties} />
            </div>
          </Row>
        </Group>
        <div className="info-banner"><Icon name="info" size={17} /> Dark mode covers Notespace, Workboard and Settings. The embedded Gantt timeline stays light for now.</div>
      </>
    );
  }

  if (section === 'workspace') {
    return (
      <>
        <h2>Workspace</h2>
        <p className="settings-panel-subtitle">Choose which experiences belong in your application.</p>
        <Group title={<>Available workspaces <span className="preview-label">DESIGN CONCEPT</span></>}>
          <Row title={<><span className="setting-icon"><Icon name="book-open" size={19} /></span> Notespace</>} description="A dedicated home for documents, notes, and knowledge."><Toggle /></Row>
          <Row title={<><span className="setting-icon"><Icon name="layout-dashboard" size={19} /></span> Workboard</>} description="A separate place for tasks, statuses, and linked note references."><Toggle /></Row>
        </Group>
        <div className="info-banner"><Icon name="info" size={17} /> These switches are only visual previews. Disabling a workspace is not implemented.</div>
      </>
    );
  }

  if (section === 'storage') {
    return (
      <>
        <h2>Storage</h2>
        <p className="settings-panel-subtitle">Where your content may live in a future version.</p>
        <Group title={<>Local storage <span className="preview-label">PLANNED</span></>}>
          <Row title="Storage location" description="Local-first storage is a future implementation choice."><span className="future-chip">Not connected</span></Row>
          <Row title="Offline content" description="Saved notes and work items are not available in this prototype."><span className="future-chip">Not available</span></Row>
        </Group>
        <Group title="Attachments">
          <Row title="File attachments" description="Add documents, images, and other assets later."><span className="future-chip">Coming later</span></Row>
        </Group>
        <div className="info-banner"><Icon name="lock" size={17} /> This prototype uses mock data only. Nothing is saved to your device or sent to a server.</div>
      </>
    );
  }

  return (
    <>
      <h2>About</h2>
      <p className="settings-panel-subtitle">A little context about the product you are exploring.</p>
      <div className="about-card">
        <span className="brand-mark brand-mark--large"><span /><span /><span /></span>
        <div><h3>Starjot</h3><p>A calmer place to think and get things done.</p></div>
      </div>
      <Group title="Application information">
        <Row title="Version" description="Current interface preview."><span className="fake-text">0.1.0 — Phase 1</span></Row>
        <Row title="Build" description="Frontend-only demonstration."><span className="fake-text">No backend connected</span></Row>
        <Row title="Design system" description="A reusable visual foundation for future development."><span className="fake-text">Light UI · Blue accent</span></Row>
      </Group>
    </>
  );
}


/* =========================
   Settings Screen
   ========================= */

export function Settings({ section, onSectionChange }: SettingsProps) {
  const current = SETTING_TABS.find(tab => tab.id === section) ?? SETTING_TABS[0];

  return (
    <div className="content-pad settings-page">
      <div className="page-intro">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" />YOUR APPLICATION</div>
          <h1>Settings</h1>
          <p>Preferences for the way you work, all in one place.</p>
        </div>
      </div>
      <div className="settings-layout">
        <aside className="settings-nav">
          <div className="settings-nav-heading">PREFERENCES</div>
          {SETTING_TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`settings-nav-item ${section === tab.id ? 'active' : ''}`}
              aria-current={section === tab.id ? 'true' : undefined}
              onClick={() => onSectionChange(tab.id)}
            >
              <Icon name={tab.icon} size={17} /> {tab.label}
            </button>
          ))}
        </aside>
        <section className="settings-content" aria-label={`${current.label} preferences`}>
          <SettingsPanel section={section} />
          <div className="settings-disclaimer"><Icon name="info" size={15} /> UI prototype: these options are illustrative and do not change application behavior.</div>
        </section>
      </div>
    </div>
  );
}
