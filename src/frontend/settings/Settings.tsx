import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { version } from '../../../package.json';
import { BrandMark } from '../components/BrandMark';
import { Icon, type IconName } from '../components/Icon';
import { updatePreferences, usePreferences, type Preferences } from '../app/preferences';
import { Switch } from '../components/Switch';
import { useEscape } from '../lib/useDismiss';
import { useFocusTrap } from '../lib/useFocusTrap';

export type SettingsSection = 'general' | 'appearance' | 'spaces' | 'notes' | 'drawing' | 'storage' | 'about';

type SettingsProps = {
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onClose: () => void;

  /* A group of settings to scroll to and highlight once, and what to call once that is done. */
  focus?: string | null;
  onFocused?: () => void;
};

type SettingsTab = { id: SettingsSection; label: string; icon: IconName };

/* The menu down the left of the panel, in three groups. */
const SETTING_GROUPS: { heading: string; tabs: SettingsTab[] }[] = [
  {
    heading: 'Starjot',
    tabs: [
      { id: 'general', label: 'General', icon: 'sliders-horizontal' },
      { id: 'appearance', label: 'Appearance', icon: 'palette' },
      { id: 'spaces', label: 'Spaces', icon: 'panels-top-left' }
    ]
  },
  {
    heading: 'Notespace',
    tabs: [
      { id: 'notes', label: 'Notes', icon: 'file-text' },
      { id: 'drawing', label: 'Drawing', icon: 'pencil' }
    ]
  },
  {
    heading: 'More',
    tabs: [
      { id: 'storage', label: 'Storage', icon: 'hard-drive' },
      { id: 'about', label: 'About', icon: 'info' }
    ]
  }
];

const SETTING_TABS = SETTING_GROUPS.flatMap(group => group.tabs);


/* =========================
   Settings Building Blocks
   ========================= */

/* A switch drawn for a setting that does not work yet. */
function Toggle({ on = true }: { on?: boolean }) {
  return <span className={`preview-switch ${on ? 'preview-switch--on' : ''}`} aria-hidden="true"><span /></span>;
}

/* One setting: its name and what it does on the left, its control on the right. Settings that */
/* do not work yet are marked "Preview". */
function Row({ title, description, preview = false, children }: { title: ReactNode; description: string; preview?: boolean; children: ReactNode }) {
  return (
    <div className={`setting-row ${preview ? 'is-preview' : ''}`}>
      <div className="setting-row-text">
        <strong>{title}{preview && <span className="preview-tag">Preview</span>}</strong>
        <p>{description}</p>
      </div>
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

function Heading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <h3 className="settings-section-title">{title}</h3>
      <p className="settings-panel-subtitle">{subtitle}</p>
    </>
  );
}


/* =========================
   Settings Sections
   ========================= */

function SettingsSectionContent({ section }: { section: SettingsSection }) {
  const { theme, density, contentsScroll, hideHeaderWhileTyping, drawing } = usePreferences();
  const set = (changes: Partial<Preferences>) => updatePreferences(changes);

  if (section === 'general') {
    return (
      <>
        <Heading title="General" subtitle="Everyday preferences for Starjot." />
        <Group title="Starting up">
          <Row preview title="Start screen" description="Choose where Starjot opens."><FakeSelect>Starjot Home</FakeSelect></Row>
        </Group>
        <Group title="Help">
          <Row preview title="Show helpful tips" description="Show small hints while you explore Starjot."><Toggle /></Row>
        </Group>
      </>
    );
  }

  if (section === 'appearance') {
    return (
      <>
        <Heading title="Appearance" subtitle="The little details that make Starjot feel like yours." />
        <Group title="Theme">
          <Row title="Theme" description="A light or dark interface. The moon or sun at the bottom of the sidebar switches it too.">
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
        </Group>
        <Group title="Layout and colour">
          <Row title="Interface density" description="How much room the sidebar, tabs, lists and menus take. Notes' text stays the same.">
            <Segmented
              label="Interface density"
              value={density}
              options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]}
              onChange={value => set({ density: value })}
            />
          </Row>
          <Row preview title="Accent colour" description="Blue is the current accent colour.">
            {/* --dot is a CSS variable that sets each colour swatch. */}
            <div className="color-options">
              <span className="color-dot selected-color" style={{ '--dot': '#3976ed' } as CSSProperties} />
              <span className="color-dot" style={{ '--dot': '#7c6be6' } as CSSProperties} />
              <span className="color-dot" style={{ '--dot': '#14a38b' } as CSSProperties} />
            </div>
          </Row>
        </Group>
        <div className="info-banner"><Icon name="info" size={17} /> Dark mode covers Notespace, Boardspace and Settings. The Gantt timeline in Boardspace stays light for now.</div>
      </>
    );
  }

  if (section === 'spaces') {
    return (
      <>
        <Heading title="Spaces" subtitle="Choose which spaces appear in Starjot." />
        <Group title="Available spaces">
          <Row preview title={<><span className="setting-icon"><Icon name="book-open" size={19} /></span> Notespace</>} description="Notes, sub-notes and categories."><Toggle /></Row>
          <Row preview title={<><span className="setting-icon"><Icon name="layout-dashboard" size={19} /></span> Boardspace</>} description="Tasks, their statuses, the timeline, and links to notes."><Toggle /></Row>
        </Group>
      </>
    );
  }

  if (section === 'notes') {
    return (
      <>
        <Heading title="Notes" subtitle="How notes start and how the note screen behaves." />
        <Group title="New notes">
          <Row preview title="Default note view" description="New notes start as continuous documents."><FakeSelect>Continuous</FakeSelect></Row>
        </Group>
        <Group title="Reading and writing">
          <Row title="Contents scrolling" description="How the note scrolls when you choose a heading in Contents.">
            <Segmented
              label="Contents scrolling"
              value={contentsScroll}
              options={[{ value: 'smooth', label: 'Smooth' }, { value: 'instant', label: 'Instant' }]}
              onChange={value => set({ contentsScroll: value })}
            />
          </Row>
          <Row title="Hide the note bar while typing" description="The bar above a note fades away while you type and comes back when you move the mouse.">
            <Switch label="Hide the note bar while typing" on={hideHeaderWhileTyping} onChange={value => set({ hideHeaderWhileTyping: value })} />
          </Row>
        </Group>
        <Group title="Lists">
          <Row preview title="Show recent notes" description="List the notes you opened lately in the sidebar."><Toggle /></Row>
        </Group>
      </>
    );
  }

  if (section === 'drawing') {
    return (
      <>
        <Heading title="Drawing" subtitle="How drawings behave when they are selected and anchored into the text." />
        <Group id="drawing" title="Anchoring">
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

  if (section === 'storage') {
    return (
      <>
        <Heading title="Storage" subtitle="Where your notes are kept." />
        <Group title="Local storage">
          <Row title="Storage location" description="Notes, categories and preferences are saved in this browser, and images in its database."><span className="fake-text">This browser</span></Row>
          <Row title="Offline content" description="Everything is on this device, so Starjot works without an internet connection."><span className="fake-text">Available</span></Row>
        </Group>
        <Group title="Attachments">
          <Row preview title="File attachments" description="Add documents and other files to notes."><span className="future-chip">Coming later</span></Row>
        </Group>
        <div className="info-banner"><Icon name="lock" size={17} /> Nothing is sent to a server. Each browser keeps its own notes, so clearing this site's data removes them.</div>
      </>
    );
  }

  return (
    <>
      <Heading title="About" subtitle="A little about Starjot." />
      <div className="about-card">
        <BrandMark size={52} />
        <div><h3>Starjot</h3><p>A calmer place to think and get things done.</p></div>
      </div>
      <Group title="Application">
        <Row title="Version" description="The version of Starjot you are using."><span className="fake-text">{version}</span></Row>
        <Row title="Build" description="Runs in the browser; a Windows app is planned."><span className="fake-text">Browser preview</span></Row>
        <Row title="Design system" description="The shared look used across Starjot."><span className="fake-text">Light and dark · Blue accent</span></Row>
      </Group>
    </>
  );
}


/* =========================
   Settings Panel
   ========================= */

/* Settings opens as a panel in the middle of the window, over whatever is open, with its menu on */
/* the left and the chosen section on the right. Escape, the close button or a click outside */
/* closes it; the keyboard stays inside while it is open. On phones it fills the screen. */
export function Settings({ section, onSectionChange, onClose, focus = null, onFocused }: SettingsProps) {
  const current = SETTING_TABS.find(tab => tab.id === section) ?? SETTING_TABS[0];
  const windowRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);

  useEscape(true, onClose);
  useFocusTrap(windowRef, '.settings-nav-item.active');

  /* Each section starts at its top. */
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [section]);

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
    <div className="dialog-backdrop settings-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="settings-window" ref={windowRef} role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <nav className="settings-nav" aria-label="Settings sections">
          <h2 id="settings-title" className="settings-title">Settings</h2>
          {SETTING_GROUPS.map(group => (
            <div key={group.heading} className="settings-nav-group">
              <div className="settings-nav-heading">{group.heading}</div>
              {group.tabs.map(tab => (
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
            </div>
          ))}
        </nav>
        <section className="settings-content" ref={contentRef} aria-label={`${current.label} settings`}>
          <button type="button" className="window-control settings-close" aria-label="Close settings" data-tooltip="Close (Esc)" data-tooltip-align="end" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
          <SettingsSectionContent section={section} />
        </section>
      </div>
    </div>
  );
}
