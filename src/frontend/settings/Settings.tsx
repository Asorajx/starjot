import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { version } from '../../../package.json';
import { BrandMark } from '../components/BrandMark';
import { Dropdown } from '../components/Dropdown';
import { Icon, type IconName } from '../components/Icon';
import { updatePreferences, usePreferences, type Preferences, type StartScreen } from '../app/preferences';
import { enabledScreens, SCREENS } from '../app/screens';
import { useCategories } from '../notespace/store';
import { Switch } from '../components/Switch';
import { useEscape } from '../lib/useDismiss';
import { useFocusTrap } from '../lib/useFocusTrap';

export type SettingsSection = 'general' | 'appearance' | 'spaces' | 'sidebar' | 'notes' | 'drawing' | 'storage' | 'about';

type SettingsProps = {
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onClose: () => void;

  /* A group of settings to scroll to and highlight once, and what to call once that is done. */
  focus?: string | null;
  onFocused?: () => void;
};

type SettingsTab = { id: SettingsSection; label: string; icon: IconName };

/* The menu down the left of the panel, in three groups. Notespace's group is hidden while */
/* Notespace is turned off. */
const SETTING_GROUPS: { heading: string; tabs: SettingsTab[] }[] = [
  {
    heading: 'Starjot',
    tabs: [
      { id: 'general', label: 'General', icon: 'sliders-horizontal' },
      { id: 'appearance', label: 'Appearance', icon: 'palette' },
      { id: 'spaces', label: 'Spaces', icon: 'panels-top-left' },
      { id: 'sidebar', label: 'Sidebar', icon: 'sidebar' }
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
  const { theme, density, startScreen, spaces, sidebar, newNotes, contentsScroll, hideHeaderWhileTyping, drawing } = usePreferences();
  const categories = useCategories();
  const set = (changes: Partial<Preferences>) => updatePreferences(changes);

  if (section === 'general') {
    /* Starjot Home, or the home of a space that is turned on. */
    const startOptions = [
      { value: 'start' as StartScreen, label: 'Starjot Home', icon: 'home' as const },
      ...enabledScreens(spaces).map(screen => ({ value: screen.id as StartScreen, label: screen.label, icon: screen.icon }))
    ];
    return (
      <>
        <Heading title="General" subtitle="Everyday preferences for Starjot." />
        <Group title="Starting up">
          <Row title="Start screen" description="Where Starjot opens. A link to a page, a bookmark or a refresh still opens that page.">
            <Dropdown
              label="Start screen"
              value={startOptions.some(option => option.value === startScreen) ? startScreen : 'start'}
              options={startOptions}
              alignEnd
              onChange={value => set({ startScreen: value })}
            />
          </Row>
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
    const descriptions = { notes: 'Notes, sub-notes and categories.', boardspace: 'Tasks, their statuses, the timeline, and links to notes.' };
    const onCount = SCREENS.filter(screen => spaces[screen.id]).length;
    return (
      <>
        <Heading title="Spaces" subtitle="Choose which spaces appear in Starjot. A space turned off is hidden everywhere; nothing in it is deleted." />
        <Group title="Available spaces">
          {SCREENS.map(screen => {
            const last = spaces[screen.id] && onCount === 1;
            return (
              <Row
                key={screen.id}
                title={<><span className="setting-icon"><Icon name={screen.icon} size={19} /></span> {screen.label}</>}
                description={last ? `${descriptions[screen.id]} At least one space stays on.` : descriptions[screen.id]}
              >
                <Switch label={screen.label} on={spaces[screen.id]} disabled={last} onChange={on => set({ spaces: { ...spaces, [screen.id]: on } })} />
              </Row>
            );
          })}
        </Group>
      </>
    );
  }

  /* What the sidebar lists, one group per space that is turned on. */
  if (section === 'sidebar') {
    return (
      <>
        <Heading title="Sidebar" subtitle="What the sidebar lists under each space." />
        {spaces.notes && (
          <Group title="Notespace">
            <Row title="Starred" description="List your starred notes in the sidebar.">
              <Switch label="Starred notes in the sidebar" on={sidebar.starred} onChange={on => set({ sidebar: { ...sidebar, starred: on } })} />
            </Row>
            <Row title="Recent" description="List the notes you opened lately in the sidebar.">
              <Switch label="Recent notes in the sidebar" on={sidebar.recent} onChange={on => set({ sidebar: { ...sidebar, recent: on } })} />
            </Row>
            <Row title="Categories" description="List categories in the sidebar, to open their pages in one click. Choose which ones below.">
              <Switch label="Categories in the sidebar" on={sidebar.categories} onChange={on => set({ sidebar: { ...sidebar, categories: on } })} />
            </Row>
            {sidebar.categories && (
              <div className="setting-checks" role="group" aria-label="Categories shown in the sidebar">
                {categories.length ? categories.map(category => (
                  <label key={category.id} className="setting-check">
                    <input
                      type="checkbox"
                      checked={!sidebar.hiddenCategories.includes(category.id)}
                      onChange={event => set({
                        sidebar: {
                          ...sidebar,
                          hiddenCategories: event.target.checked
                            ? sidebar.hiddenCategories.filter(id => id !== category.id)
                            : [...sidebar.hiddenCategories, category.id]
                        }
                      })}
                    />
                    <Icon name="folder" size={14} /> {category.name}
                  </label>
                )) : <p className="setting-checks-empty">No categories yet. Add them on the notes home with Edit categories.</p>}
              </div>
            )}
          </Group>
        )}
        {spaces.boardspace && (
          <Group title="Boardspace">
            <Row preview title="Boards" description="Starred and recent boards, once Boardspace holds several boards. For now its sidebar lists the board's views."><span className="future-chip">Coming later</span></Row>
          </Group>
        )}
      </>
    );
  }

  if (section === 'notes') {
    return (
      <>
        <Heading title="Notes" subtitle="How notes start and how the note screen behaves." />
        <Group title="New notes">
          <Row title="View" description="Continuous is one flowing document; Block shows each line as a block you can drag and move. Notes already made keep their own view.">
            <Segmented
              label="View for new notes"
              value={newNotes.mode}
              options={[{ value: 'continuous', label: 'Continuous' }, { value: 'blocks', label: 'Block' }]}
              onChange={value => set({ newNotes: { ...newNotes, mode: value } })}
            />
          </Row>
          <Row title="Layout" description="Pageless runs on without breaks; Paginated shows the note on pages, as it prints.">
            <Segmented
              label="Layout for new notes"
              value={newNotes.layout}
              options={[{ value: 'pageless', label: 'Pageless' }, { value: 'paginated', label: 'Paginated' }]}
              onChange={value => set({ newNotes: { ...newNotes, layout: value } })}
            />
          </Row>
          {newNotes.layout === 'paginated' && (
            <Row title="Paper size" description="The page size new paginated notes start with.">
              <Segmented
                label="Paper size for new notes"
                value={newNotes.pageSize}
                options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }]}
                onChange={value => set({ newNotes: { ...newNotes, pageSize: value } })}
              />
            </Row>
          )}
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
      </>
    );
  }

  if (section === 'drawing') {
    return (
      <>
        <Heading title="Drawing" subtitle="Drawing over notes, and how drawings behave when they are anchored into the text." />
        <Group title="Drawing">
          <Row title="Drawing" description="The pencil in the note bar, for drawing over notes. Turned off, it is hidden; drawings already in notes still show.">
            <Switch label="Drawing" on={drawing.enabled} onChange={on => set({ drawing: { ...drawing, enabled: on } })} />
          </Row>
        </Group>
        {drawing.enabled && <Group id="drawing" title="Anchoring">
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
        </Group>}
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
  const { spaces } = usePreferences();
  const groups = SETTING_GROUPS.filter(group => spaces.notes || group.heading !== 'Notespace');
  const tabs = groups.flatMap(group => group.tabs);
  const current = tabs.find(tab => tab.id === section) ?? tabs[0];
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
          {groups.map(group => (
            <div key={group.heading} className="settings-nav-group">
              <div className="settings-nav-heading">{group.heading}</div>
              {group.tabs.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  className={`settings-nav-item ${current.id === tab.id ? 'active' : ''}`}
                  aria-current={current.id === tab.id ? 'true' : undefined}
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
          <SettingsSectionContent section={current.id} />
        </section>
      </div>
    </div>
  );
}
