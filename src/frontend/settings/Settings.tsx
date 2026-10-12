import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { updatePreferences, usePreferences, type Preferences } from '../app/preferences';

export type SettingsSection = 'general' | 'appearance' | 'workspace' | 'storage' | 'about';

type SettingsProps = {
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;

  /* A group of settings to scroll to and highlight once, such as "drawing" (from the drawing */
  /* toolbar's settings button), and what to call once that is done. */
  focus?: string | null;
  onFocused?: () => void;
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

/* The same switch as Toggle, but one that really turns a setting on and off. */
function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`preview-switch setting-switch ${on ? 'preview-switch--on' : ''}`} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

function Row({ title, description, children }: { title: ReactNode; description: string; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-row-text"><strong>{title}</strong><p>{description}</p></div>
      <div className="setting-value">{children}</div>
    </div>
  );
}

function Group({ id, title, children }: { id?: string; title: ReactNode; children: ReactNode }) {
  return <div className="settings-group" id={id ? `settings-group-${id}` : undefined}><div className="settings-group-title">{title}</div>{children}</div>;
}

/* A row of buttons where exactly one is chosen, used for settings that really change the app. */
function Segmented<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="setting-segment" role="radiogroup" aria-label={label}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={value === option.value ? 'chosen' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function FakeSelect({ children }: { children: ReactNode }) {
  return <span className="fake-select">{children} <Icon name="chevron-down" size={14} /></span>;
}


/* =========================
   Settings Panels
   ========================= */

function SettingsPanel({ section }: { section: SettingsSection }) {
  const { theme, contentsScroll, hideHeaderWhileTyping, drawing } = usePreferences();
  const set = (changes: Partial<Preferences>) => updatePreferences(changes);

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
          <Row title="Contents scrolling" description="How the page moves when you choose a heading in Contents.">
            <Segmented
              label="Contents scrolling"
              value={contentsScroll}
              options={[{ value: 'smooth', label: 'Smooth' }, { value: 'instant', label: 'Instant' }]}
              onChange={value => set({ contentsScroll: value })}
            />
          </Row>
          <Row title="Hide the page bar while typing" description="The bar above a note fades away while you type and comes back when you move the mouse.">
            <Switch label="Hide the page bar while typing" on={hideHeaderWhileTyping} onChange={value => set({ hideHeaderWhileTyping: value })} />
          </Row>
        </Group>
        <Group id="drawing" title="Drawing">
          <Row title="Strokes on the edge of a selection" description="When anchoring a drawing into the text, take the strokes mostly inside the box, or cut strokes at its edge.">
            <Segmented
              label="Strokes on the edge of a selection"
              value={drawing.selectEdge}
              options={[{ value: 'whole', label: 'Mostly inside' }, { value: 'cut', label: 'Cut at the edge' }]}
              onChange={value => set({ drawing: { ...drawing, selectEdge: value } })}
            />
          </Row>
          <Row title="Snap anchored drawings to the text" description="An anchored drawing lines up with its line and the side of the text when it is anchored or moved. Turn off to keep it exactly where you place it.">
            <Switch label="Snap anchored drawings to the text" on={drawing.snap} onChange={value => set({ drawing: { ...drawing, snap: value } })} />
          </Row>
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
          <Row title="Theme" description="Choose a light or dark interface.">
            <Segmented
              label="Theme"
              value={theme}
              options={[
                { value: 'light', label: <><Icon name="sun" size={14} /> Light</> },
                { value: 'dark', label: <><Icon name="moon" size={14} /> Dark</> }
              ]}
              onChange={value => set({ theme: value })}
            />
          </Row>
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
        <Group title="Available workspaces">
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
        <Group title="Local storage">
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

export function Settings({ section, onSectionChange, focus = null, onFocused }: SettingsProps) {
  const current = SETTING_TABS.find(tab => tab.id === section) ?? SETTING_TABS[0];

  /* Scroll to the asked-for group and highlight it briefly, so it is easy to spot. */
  useEffect(() => {
    if (!focus) return;
    const group = document.getElementById(`settings-group-${focus}`);
    group?.scrollIntoView({ block: 'center' });
    group?.classList.add('is-highlighted');
    const timer = window.setTimeout(() => group?.classList.remove('is-highlighted'), 1600);
    onFocused?.();
    return () => window.clearTimeout(timer);
  }, [focus, onFocused]);

  return (
    <div className="content-pad settings-page">
      <div className="page-intro">
        <div>
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
          <div className="settings-disclaimer"><Icon name="info" size={15} /> Theme, Contents scrolling, Hide the page bar while typing and the Drawing options are saved. The other options are previews and do not change anything yet.</div>
        </section>
      </div>
    </div>
  );
}
