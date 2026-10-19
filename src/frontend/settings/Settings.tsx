import { useEffect, useRef, useState, type ReactNode } from 'react';
import { version } from '../../../package.json';
import { BrandMark } from '../components/BrandMark';
import { Dropdown } from '../components/Dropdown';
import { Icon, type IconName } from '../components/Icon';
import { ACCENTS, updatePreferences, usePreferences, type Accent, type Preferences, type StartScreen } from '../app/preferences';
import { enabledScreens, SCREENS } from '../app/screens';
import {
  checkCombo, comboOf, FIXED_SHORTCUTS, isChanged, keyLabel, keyParts, keysOf, resetAllShortcuts, resetShortcut, setShortcut, SHORTCUTS, swapShortcuts,
  type ShortcutGroup, type ShortcutId
} from '../app/shortcuts';
import { useCategories } from '../notespace/store';
import { Switch } from '../components/Switch';
import { useEscape } from '../lib/useDismiss';
import { useFocusTrap } from '../lib/useFocusTrap';

export type SettingsSection = 'general' | 'appearance' | 'spaces' | 'sidebar' | 'notes' | 'typing' | 'drawing' | 'shortcuts' | 'storage' | 'about';

type SettingsProps = {
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onClose: () => void;

  /* A group of settings to scroll to and highlight once, and what to call once that is done. */
  focus?: string | null;
  onFocused?: () => void;
};

type SettingsTab = { id: SettingsSection; label: string; icon: IconName };

/* A typing shortcut, as Notespace → Typing lists it: what it does and what to type (one list */
/* of keys per way of doing it). */
type Shortcut = { action: string; keys: string[][] };

/* What can be typed into a note's text to format it, listed in Notespace → Typing. */
const LINE_SHORTCUTS: Shortcut[] = [
  { action: 'Heading 1 to 5', keys: [['#', 'Space'], ['#####', 'Space']] },
  { action: 'Bulleted and numbered list', keys: [['-', 'Space'], ['1.', 'Space']] },
  { action: 'Checklist, empty or ticked', keys: [['[]', 'Space'], ['[x]', 'Space']] },
  { action: 'Quote', keys: [['>', 'Space']] },
  { action: 'Code block and divider', keys: [['```', 'Enter'], ['---', 'Enter']] }
];

const ANYWHERE_SHORTCUTS: Shortcut[] = [
  { action: 'Em dash (Undo straight after keeps the hyphens)', keys: [['-', '-']] }
];

/* One changeable shortcut. Clicking its keys records new ones; Escape or clicking elsewhere */
/* cancels. While recording, a changed shortcut offers Reset to default. Keys already used by */
/* another shortcut can be swapped, and keys a browser tab keeps are allowed with a note. */
function ShortcutEditor({ id, action }: { id: ShortcutId; action: string }) {
  usePreferences();
  const [recording, setRecording] = useState(false);
  const [message, setMessage] = useState<{ text: string; swap?: { with: ShortcutId; combo: string } } | null>(null);
  useEscape(recording, () => setRecording(false));

  useEffect(() => {
    if (!recording) return;

    /* Caught before the app's own shortcuts, so the keys pressed only set this shortcut. */
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const combo = comboOf(event);
      if (!combo) return;
      const check = checkCombo(combo, id);
      if (check.kind === 'refused') {
        setMessage({ text: check.reason });
        return;
      }
      setRecording(false);
      if (check.kind === 'taken') {
        const other = SHORTCUTS.find(item => item.id === check.by)?.action ?? '';
        const current = keyLabel(keysOf(id)[0]);
        setMessage({ text: `${keyLabel(combo)} is used for ${other}. Swap them, so ${other} gets ${current}?`, swap: { with: check.by, combo } });
        return;
      }
      setShortcut(id, combo);
      setMessage(check.browserOnly ? { text: `In a browser tab, the browser keeps ${keyLabel(combo)} for itself; it works in the desktop app.` } : null);
    }
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [recording, id]);

  const keys = keysOf(id)[0];
  return (
    <div className="shortcut-editor">
      <div className="shortcut-row">
        <span>{action}</span>
        <span className="shortcut-keys">
          {recording && isChanged(id) && (
            <button
              type="button"
              className="btn btn-sm btn-tertiary"
              onMouseDown={event => event.preventDefault()}
              onClick={() => {
                resetShortcut(id);
                setRecording(false);
                setMessage(null);
              }}
            >
              Reset to default
            </button>
          )}
          <button
            type="button"
            className={`shortcut-edit ${recording ? 'is-recording' : ''} ${isChanged(id) ? 'is-changed' : ''}`}
            aria-label={recording ? `Press the new keys for ${action}` : `Change ${action}, now ${keyLabel(keys)}`}
            onClick={() => {
              setMessage(null);
              setRecording(!recording);
            }}
            onBlur={() => setRecording(false)}
          >
            {recording ? <span className="shortcut-recording">Press keys…</span> : keyParts(keys).map((key, at) => <kbd key={at}>{key}</kbd>)}
          </button>
        </span>
      </div>
      {message && (
        <div className={`shortcut-notice ${message.swap ? 'is-clash' : ''}`} role="status">
          <Icon name={message.swap ? 'alert-triangle' : 'info'} size={14} />
          <span className="shortcut-notice-text">{message.text}</span>
          {message.swap && (
            <span className="shortcut-notice-actions">
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => {
                  if (message.swap) swapShortcuts(id, message.swap.with, message.swap.combo);
                  setMessage(null);
                }}
              >
                Swap
              </button>
              <button type="button" className="btn btn-sm btn-tertiary" onClick={() => setMessage(null)}>Keep {keyLabel(keys)}</button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const SHORTCUT_SECTIONS: ShortcutGroup[] = ['Everywhere', 'Tabs', 'In a note'];

/* One row per shortcut: what it does, and its keys (with "or" between different ways). */
function ShortcutRows({ shortcuts }: { shortcuts: Shortcut[] }) {
  return (
    <>
      {shortcuts.map(shortcut => (
        <div key={shortcut.action} className="shortcut-row">
          <span>{shortcut.action}</span>
          <span className="shortcut-keys">
            {shortcut.keys.map((keys, way) => (
              <span key={way} className="shortcut-way">
                {way > 0 && <span className="shortcut-or">or</span>}
                {keys.map((key, at) => <kbd key={at}>{key}</kbd>)}
              </span>
            ))}
          </span>
        </div>
      ))}
    </>
  );
}

/* The accent colours' names, as Settings shows them. */
const ACCENT_NAMES: Record<Accent, string> = {
  blue: 'Blue', indigo: 'Indigo', violet: 'Violet', rose: 'Rose', amber: 'Amber', teal: 'Teal', slate: 'Slate', sage: 'Sage'
};

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
      { id: 'typing', label: 'Typing', icon: 'type' },
      { id: 'drawing', label: 'Drawing', icon: 'pencil' }
    ]
  },
  {
    heading: 'More',
    tabs: [
      { id: 'shortcuts', label: 'Keyboard shortcuts', icon: 'keyboard' },
      { id: 'storage', label: 'Storage', icon: 'hard-drive' },
      { id: 'about', label: 'About', icon: 'info' }
    ]
  }
];


/* =========================
   Settings Building Blocks
   ========================= */

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
  const { theme, accent, density, startScreen, spaces, sidebar, newNotes, openNotesIn, openNewSubNotes, noteColorsInLists, contentsScroll, hideHeaderWhileTyping, tips, spellcheck, typingShortcuts, drawing } = usePreferences();
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
          <Row title="Show helpful tips" description="Keyboard shortcuts in button tooltips, the shortcut badge in the search box, and hints in empty lists.">
            <Switch label="Show helpful tips" on={tips} onChange={on => set({ tips: on })} />
          </Row>
        </Group>
      </>
    );
  }

  if (section === 'appearance') {
    return (
      <>
        <Heading title="Appearance" subtitle="The little details that make Starjot feel like yours." />
        <Group title="Theme">
          <Row title="Theme" description="Light, dark, or System to follow your computer. The moon or sun at the bottom of the sidebar switches between light and dark too.">
            <Segmented
              label="Theme"
              value={theme}
              options={[
                { value: 'light', label: <><Icon name="sun" size={14} /> Light</> },
                { value: 'dark', label: <><Icon name="moon" size={14} /> Dark</> },
                { value: 'system', label: <><Icon name="monitor" size={14} /> System</> }
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
          <Row title="Accent colour" description={`Buttons, links, selections and focus outlines. Now: ${ACCENT_NAMES[accent]}.`}>
            <div className="accent-options" role="radiogroup" aria-label="Accent colour">
              {ACCENTS.map(option => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={accent === option}
                  aria-label={ACCENT_NAMES[option]}
                  data-tooltip={ACCENT_NAMES[option]}
                  data-accent={option}
                  className={`accent-swatch ${accent === option ? 'is-chosen' : ''}`}
                  onClick={() => set({ accent: option })}
                >
                  {accent === option && <Icon name="check" size={14} />}
                </button>
              ))}
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
        <Group title="Opening notes">
          <Row title="Open notes in" description="Where a note opens when you click it, find it in Search or make it. Ctrl + click does the opposite.">
            <Dropdown
              label="Open notes in"
              value={openNotesIn}
              options={[{ value: 'current', label: 'This tab' }, { value: 'new-notes', label: 'A new tab for new notes' }, { value: 'always', label: 'A new tab' }]}
              alignEnd
              onChange={value => set({ openNotesIn: value })}
            />
          </Row>
          <Row title="Open new sub-notes" description="Open a sub-note as soon as you add it. When off, you name it on its card and keep writing.">
            <Switch label="Open new sub-notes" on={openNewSubNotes} onChange={on => set({ openNewSubNotes: on })} />
          </Row>
        </Group>
        <Group title="Note lists">
          <Row title="Show note colours in lists" description="A note's colour shows along its row or card in Notespace and category pages. When off, it only shows in the note's preview.">
            <Switch label="Show note colours in lists" on={noteColorsInLists} onChange={on => set({ noteColorsInLists: on })} />
          </Row>
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
          <Row title="Spellcheck" description="Underline misspelt words in notes and their remarks, using your browser's dictionary.">
            <Switch label="Spellcheck" on={spellcheck} onChange={on => set({ spellcheck: on })} />
          </Row>
          <Row title="Hide the note bar while typing" description="The bar above a note fades away while you type and comes back when you move the mouse.">
            <Switch label="Hide the note bar while typing" on={hideHeaderWhileTyping} onChange={value => set({ hideHeaderWhileTyping: value })} />
          </Row>
        </Group>
      </>
    );
  }

  if (section === 'typing') {
    return (
      <>
        <Heading title="Typing" subtitle="What can be typed into a note's text to format it as you write." />
        <Group title="Typing shortcuts">
          <Row title="Typing shortcuts" description="Turn the shortcuts below on or off. Turned off, notes keep exactly what you type. Type / for the command menu either way.">
            <Switch label="Typing shortcuts" on={typingShortcuts} onChange={on => set({ typingShortcuts: on })} />
          </Row>
        </Group>
        {typingShortcuts && (
          <>
            <Group title="At the start of an empty line">
              <ShortcutRows shortcuts={LINE_SHORTCUTS} />
            </Group>
            <Group title="Anywhere in a line">
              <ShortcutRows shortcuts={ANYWHERE_SHORTCUTS} />
            </Group>
          </>
        )}
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

  if (section === 'shortcuts') {
    return (
      <>
        <Heading title="Keyboard shortcuts" subtitle="Click a shortcut's keys to change them. On a Mac, Cmd works in place of Ctrl, except in the tab switcher. What can be typed into notes is in Notespace → Typing." />
        {SHORTCUTS.some(item => isChanged(item.id)) && (
          <div className="shortcut-reset-all">
            <button type="button" className="btn btn-sm btn-secondary" onClick={resetAllShortcuts}>Reset all to default</button>
          </div>
        )}
        {SHORTCUT_SECTIONS.map(group => (
          <Group key={group} title={group}>
            {group === 'Tabs' && <p className="shortcut-note">In a browser tab, the browser keeps the default keys for its own tabs; they work in the desktop app.</p>}
            {SHORTCUTS.filter(item => item.group === group).map(item => <ShortcutEditor key={item.id} id={item.id} action={item.action} />)}
            <ShortcutRows shortcuts={FIXED_SHORTCUTS.filter(item => item.group === group).map(item => ({ action: item.action, keys: item.keys.map(keyParts) }))} />
          </Group>
        ))}
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
        <Row title="Design system" description="The shared look used across Starjot."><span className="fake-text">Light and dark · {ACCENT_NAMES[accent]} accent</span></Row>
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
          <button type="button" className="window-control settings-close" aria-label="Close settings" data-tooltip="Close" data-shortcut="Esc" data-tooltip-align="end" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
          <SettingsSectionContent section={current.id} />
        </section>
      </div>
    </div>
  );
}
