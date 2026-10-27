import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import { getPreferences, opensInNewTab, updatePreferences, usePreferences, type Spaces } from './preferences';
import { MobileNav, Sidebar, Topbar, WindowControls } from './Shell';
import { NOTE_DRAG_TYPE } from '../lib/clicks';
import { isShortcut, switcherModifier } from './shortcuts';
import { useDismiss, useEscape } from '../lib/useDismiss';
import { useMediaQuery } from '../lib/useMediaQuery';
import { CategoryPage } from '../notespace/CategoryPage';
import { NotesHome, type NoteFilter } from '../notespace/NotesHome';
import { StarjotHome } from '../home/StarjotHome';
import { SearchWindow } from '../search/SearchWindow';
import { ReminderWatcher } from './Reminders';
import { Breadcrumb } from '../components/Breadcrumb';
import { Toaster } from '../components/Toaster';
import { TrashPopup } from '../notespace/TrashPopup';
import { showToast } from '../lib/toasts';
import { findWhenOpened } from '../notespace/editor/find/pendingFind';
import type { ViewControls } from '../notespace/editor/EditorPanels';
import { NoteEditor } from '../notespace/editor/NoteEditor';
import { PageBar, placeExists, placeLabel, type PageHistory } from '../notespace/PageBar';
import { createNote, flushSave, getNote, updateNote } from '../notespace/store';
import { Settings, type SettingsSection } from '../settings/Settings';
import { Boardspace } from '../boardspace/Boardspace';
import { openWorkItem } from '../boardspace/openWork';
import type { BoardTab } from '../../shared/types/board';
import type { NoteKind } from '../../shared/types/note';
import {
  activeTab, addBackgroundTab, addTab, canAddTab, canSplit, canStack, closeTab, currentPlace, cycleTab, focusedGroup, focusGroup, goTo, isOpenInStack, isSplit, moveTab, newTab,
  continueIdsAfter, newWorkspace, reopenLastClosed, restoreWorkspace, samePlace, selectTab, splitWithTab, splitWorkspace, stackGroup, step, stepPlace, STACK_LIMIT, unsplit, updateTab, type ClosedTab, type NoteTab, type SplitSide,
  type Place, type TabGroup, type Workspace
} from './noteTabs';
import { DocumentTitle, StackSpine, TAB_DRAG_TYPE, TabSwitcher, WindowBar } from './WindowBar';
import { screenLabel, type ScreenId } from './screens';
import { addressOf, blockInAddress, parseAddress } from './address';
import { revealWhenShown } from '../notespace/editor/links/blockLinks';
import { readWorkspace, writeWorkspace } from '../../backend/storage/workspaceStorage';


/* =========================
   Tab Group Frame
   ========================= */

/* Below this width a stacked group has no room for two open tabs, so only its active tab is open. */
const TWO_OPEN_WIDTH = 760;

/* Ctrl + Shift + T can bring back this many closed tabs. */
const CLOSED_TAB_LIMIT = 20;

type TabGroupFrameProps = {
  group: TabGroup;
  focused: boolean;
  onFocus: () => void;

  /* A tab was dropped on this group: dropped on a tab (or its strip), it goes before that tab. */
  onDropTab: (fromGroupId: string, tabId: string, beforeTabId: string | null) => void;

  /* A note was dropped on this group's tab bar: it opens in a new tab, before the tab it was */
  /* dropped on, or at the end. */
  onDropNote: (noteId: string, beforeTabId: string | null) => void;

  /* Whether there is room for another group, and a tab dropped on an edge of this group's page. */
  canSplit: boolean;
  onSplitTab: (fromGroupId: string, tabId: string, side: SplitSide) => void;
  children: ReactNode;
};

/* The tab a drop lands before, marked while a note is dragged over the tab bar. */
function dropBefore(event: DragEvent) {
  return (event.target as Element).closest?.<HTMLElement>('[data-tab-id]') ?? null;
}

function markDropBefore(tab: HTMLElement | null) {
  document.querySelectorAll('.is-drop-before').forEach(item => item !== tab && item.classList.remove('is-drop-before'));
  tab?.classList.add('is-drop-before');
}

/* The edge of a page a tab is dragged nearest to, which a drop splits towards, or null in its */
/* middle (where a drop just moves the tab into this group, as on its tab bar). */
function splitSideAt(event: DragEvent, page: Element) {
  const box = page.getBoundingClientRect();
  const x = (event.clientX - box.left) / box.width;
  const y = (event.clientY - box.top) / box.height;
  if (x > 0.3 && x < 0.7 && y > 0.3 && y < 0.7) return null;
  const edges: [SplitSide, number][] = [['left', x], ['right', 1 - x], ['top', y], ['bottom', 1 - y]];
  return edges.reduce((nearest, edge) => (edge[1] < nearest[1] ? edge : nearest))[0];
}

/* The element around one tab group. It measures its own width (CSS cannot do this here: a CSS */
/* container would also move the note's floating toolbars), and marks itself narrow when needed. */
/* It also takes tabs dragged from either group. Drops are caught before they reach the note, so */
/* the editor never treats a dragged tab as text. */
function TabGroupFrame({ group, focused, onFocus, onDropTab, onDropNote, canSplit, onSplitTab, children }: TabGroupFrameProps) {
  const ref = useRef<HTMLElement>(null);
  const [narrow, setNarrow] = useState(false);
  const [dropping, setDropping] = useState(false);

  /* While a tab is dragged over an edge of the page: that side, and where the new group would */
  /* go (shaded), relative to this frame. */
  const [split, setSplit] = useState<{ side: SplitSide; box: { left: number; top: number; width: number; height: number } } | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setNarrow(element.clientWidth < TWO_OPEN_WIDTH));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const isTabDrag = (event: DragEvent) => event.dataTransfer.types.includes(TAB_DRAG_TYPE);

  /* Notes are only taken on the tab bar (or a stack's strips), so dropping one on a page does nothing. */
  const isNoteDrop = (event: DragEvent) => event.dataTransfer.types.includes(NOTE_DRAG_TYPE)
    && Boolean((event.target as Element).closest?.('.window-bar, .stack-spine'));

  /* The page area under a dragged tab, when a drop there can split the window. */
  const splitPage = (event: DragEvent) => {
    if (!canSplit || !isTabDrag(event) || (event.target as Element).closest?.('.window-bar, .stack-spine')) return null;
    return (event.target as Element).closest?.('.tab-group-body') ?? null;
  };

  function handleDragOver(event: DragEvent) {
    const note = isNoteDrop(event);
    if (!isTabDrag(event) && !note) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = note ? 'copy' : 'move';
    if (note) markDropBefore(dropBefore(event));
    const page = splitPage(event);
    const side = page ? splitSideAt(event, page) : null;
    if (page && side && ref.current) {
      const frame = ref.current.getBoundingClientRect();
      const area = page.getBoundingClientRect();
      const across = side === 'left' || side === 'right';
      setSplit({
        side,
        box: {
          left: area.left - frame.left + (side === 'right' ? area.width / 2 : 0),
          top: area.top - frame.top + (side === 'bottom' ? area.height / 2 : 0),
          width: across ? area.width / 2 : area.width,
          height: across ? area.height : area.height / 2
        }
      });
    } else {
      setSplit(null);
    }
    setDropping(!side);
  }

  function handleDragLeave(event: DragEvent) {
    if (ref.current?.contains(event.relatedTarget as Node | null)) return;
    setDropping(false);
    setSplit(null);
    markDropBefore(null);
  }

  function handleDrop(event: DragEvent) {
    if (isNoteDrop(event)) {
      event.preventDefault();
      event.stopPropagation();
      setDropping(false);
      markDropBefore(null);
      onDropNote(event.dataTransfer.getData(NOTE_DRAG_TYPE), dropBefore(event)?.dataset.tabId ?? null);
      return;
    }
    if (!isTabDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setDropping(false);
    setSplit(null);
    const { groupId, tabId } = JSON.parse(event.dataTransfer.getData(TAB_DRAG_TYPE)) as { groupId: string; tabId: string };
    const page = splitPage(event);
    const side = page ? splitSideAt(event, page) : null;
    if (side) {
      onSplitTab(groupId, tabId, side);
      return;
    }
    const before = (event.target as Element).closest?.<HTMLElement>('[data-tab-id]')?.dataset.tabId ?? null;
    onDropTab(groupId, tabId, before);
  }

  return (
    <section
      ref={ref}
      className={`tab-group ${focused ? 'is-focused' : ''} ${group.stacked ? 'is-stacked' : ''} ${narrow ? 'is-narrow' : ''} ${dropping ? 'is-drop-target' : ''}`}
      onMouseDownCapture={onFocus}
      onFocusCapture={onFocus}
      onDragOverCapture={handleDragOver}
      onDragLeave={handleDragLeave}
      onDropCapture={handleDrop}
    >
      {children}
      {split && <div className={`tab-split-preview is-${split.side}`} style={split.box} aria-hidden="true" />}
    </section>
  );
}


/* =========================
   Application
   ========================= */

/* Whether a place can be shown: it still exists, and its space is turned on. Starjot Home always can. */
function placeAllowed(place: Place, spaces: Spaces) {
  return placeExists(place) && (place.kind === 'start' || spaces.notes);
}

/* The layout saved last time (see workspaceStorage.ts): the tabs, the space shown and */
/* Boardspace's view. */
type SavedLayout = { workspace?: unknown; screen?: unknown; view?: unknown };
const BOARD_VIEWS: BoardTab[] = ['summary', 'list', 'board', 'timeline'];

/* What Starjot shows when it opens: the page its address names (a refresh or a bookmark); else, */
/* when continuing where it was left (Settings → General), the space shown last time; or else */
/* the start screen chosen in Settings. A space that is turned off is never opened. */
function openingPage(saved: SavedLayout | null): { screen: ScreenId; place: Place; view: BoardTab; addressed: boolean } {
  const { spaces, startScreen } = getPreferences();
  const address = parseAddress(window.location.hash);
  const view = BOARD_VIEWS.find(item => item === saved?.view) ?? 'summary';

  /* A block link opened from outside (a bookmark, another app) shows its block once open. */
  const block = blockInAddress(window.location.hash);
  if (block && address?.kind === 'place' && address.place.kind === 'note') revealWhenShown(address.place.id, block);
  if (address?.kind === 'board' && spaces.boardspace) return { screen: 'boardspace', place: { kind: 'start' }, view: address.view, addressed: true };
  if (address?.kind === 'place' && placeAllowed(address.place, spaces)) return { screen: 'notes', place: address.place, view, addressed: true };
  if (saved?.screen === 'boardspace' && spaces.boardspace) return { screen: 'boardspace', place: { kind: 'start' }, view, addressed: false };
  if (saved?.screen === 'notes') return { screen: 'notes', place: { kind: 'start' }, view, addressed: false };
  if (startScreen === 'boardspace' && spaces.boardspace) return { screen: 'boardspace', place: { kind: 'start' }, view: 'summary', addressed: false };
  return { screen: 'notes', place: startScreen === 'notes' && spaces.notes ? { kind: 'home' } : { kind: 'start' }, view: 'summary', addressed: false };
}

/* The tabs Starjot opens with: last time's, when continuing (with a page an address names shown */
/* in the focused group: on a tab already showing it, or in its open tab), or a fresh tab. */
function openingTabs(saved: SavedLayout | null, opening: ReturnType<typeof openingPage>): Workspace {
  const { spaces } = getPreferences();
  const restored = saved ? restoreWorkspace(saved.workspace, place => placeAllowed(place, spaces)) : null;
  if (!restored) return newWorkspace(opening.place);
  continueIdsAfter(restored);
  if (!opening.addressed || opening.screen !== 'notes') return restored;
  const shown = focusedGroup(restored);
  const showing = shown.tabs.find(tab => samePlace(currentPlace(tab), opening.place));
  if (showing) return selectTab(restored, shown.id, showing.id);
  return updateTab(restored, shown.id, goTo(activeTab(shown), opening.place));
}

/* Last time's layout, when Settings says to continue where Starjot was left. */
function savedLayout(): SavedLayout | null {
  if (getPreferences().onStartup !== 'continue') return null;
  const saved = readWorkspace();
  return saved && typeof saved === 'object' ? saved as SavedLayout : null;
}

/* Only navigation lives here; note content belongs to the Notespace store. */
export function App() {
  const [saved] = useState(savedLayout);
  const [opening] = useState(() => openingPage(saved));
  const [screenId, setScreenId] = useState<ScreenId>(opening.screen);

  /* The tab groups (one, or two after a split), each with its tabs and their histories. */
  const [tabs, setTabs] = useState<Workspace>(() => openingTabs(saved, opening));
  const [workTab, setWorkTab] = useState<BoardTab>(opening.view);

  /* The layout is saved as it changes, so Starjot can open where it was left. */
  useEffect(() => {
    writeWorkspace({ version: 1, workspace: tabs, screen: screenId, view: workTab });
  }, [tabs, screenId, workTab]);
  /* Settings is a panel over the app: open or not, the section shown, and a group to highlight. */
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general');
  const [settingsFocus, setSettingsFocus] = useState<string | null>(null);
  const clearSettingsFocus = useCallback(() => setSettingsFocus(null), []);
  const [noteFilter, setNoteFilter] = useState<NoteFilter>('all');
  const { sidebarCollapsed, spaces } = usePreferences();

  /* The sidebar docks beside the page when the user chose so and the window has room; otherwise */
  /* it floats over the page as a popup. "hover" popups close when the pointer leaves them; */
  /* "click" popups stay until Escape or a click elsewhere. */
  const roomToDock = useMediaQuery('(min-width: 901px)');
  const docked = !sidebarCollapsed && roomToDock;
  const [popup, setPopup] = useState<'hover' | 'click' | null>(null);

  /* The search window while open: its starting text, and the tab group whose + opened it (things */
  /* chosen then open in a new tab of that group), or null to open them in the current tab. */
  const [searchState, setSearchState] = useState<{ query: string; tabGroup: string | null } | null>(null);
  const popupTimer = useRef<number | undefined>(undefined);

  const group = focusedGroup(tabs);
  const place = currentPlace(activeTab(group));

  /* Change one tab, saving pending edits first and starting the new page at its top. */
  function changeTab(groupId: string, tabId: string, change: (tab: NoteTab) => NoteTab | null) {
    const tab = tabs.groups.find(item => item.id === groupId)?.tabs.find(item => item.id === tabId);
    const next = tab ? change(tab) : null;
    if (!next || next === tab) return;
    flushSave();
    setTabs(current => updateTab(current, groupId, next));
    scrollToTop(tabId);
  }

  /* Change the tab groups as a whole (split, stack, close or switch tabs). */
  function changeTabs(change: (current: Workspace) => Workspace) {
    flushSave();
    setTabs(change);
  }

  /* Pages opened from outside a tab (the sidebar, Ctrl + N) open in the focused group's active tab. */
  function go(next: Place, groupId = group.id, tabId = activeTab(group).id) {
    setScreenId('notes');
    changeTab(groupId, tabId, tab => goTo(tab, next));
  }

  /* Open the Settings panel, at a section (and a group to highlight) when asked, such as Drawing */
  /* from the drawing toolbar; otherwise at the section last shown. */
  function openSettings(section?: SettingsSection, focus: string | null = null) {
    flushSave();
    setPopup(null);
    if (section) setSettingsSection(section);
    setSettingsFocus(focus);
    setSettingsOpen(true);
  }

  function navigate(next: ScreenId) {
    if (!spaces[next]) return;
    flushSave();
    setScreenId(next);
    if (next === 'notes') go({ kind: 'home' });
  }

  /* A view of the board picked in the sidebar, such as its Timeline. */
  function openBoardView(view: BoardTab) {
    flushSave();
    setScreenId('boardspace');
    setWorkTab(view);
  }

  function scrollToTop(tabId: string) {
    requestAnimationFrame(() => document.querySelector(`[data-tab="${tabId}"]`)?.scrollTo(0, 0));
  }

  /* The last tab opened in the background, and the tab it was opened from: the next one opened */
  /* from that tab goes after it, so they keep their order. */
  const backgroundRun = useRef({ from: '', last: '' });

  /* Add a tab beside the active one: shown, or in the background (see focusNewTabs). */
  function addNewTab(groupId: string, tab: NoteTab, show: boolean) {
    if (show) {
      setScreenId('notes');
      changeTabs(current => addTab(current, groupId, tab, true));
      return;
    }
    const from = activeTab(tabs.groups.find(item => item.id === groupId) ?? group).id;
    const after = backgroundRun.current.from === from ? backgroundRun.current.last : from;
    backgroundRun.current = { from, last: tab.id };
    changeTabs(current => addBackgroundTab(current, groupId, tab, after));
  }

  /* Ctrl + click opens a place in a new tab beside the active one (see opensNewTab), in the */
  /* background unless Settings → Notes → Switch to new tabs is on; show makes it the active tab */
  /* (for a note just made). A full stack has no room for another tab, so the place opens in the */
  /* active tab instead. */
  function openInNewTab(next: Place, show = getPreferences().focusNewTabs) {
    if (!canAddTab(group)) {
      go(next);
      return activeTab(group).id;
    }
    const tab = newTab(next);
    addNewTab(group.id, tab, show);
    return tab.id;
  }

  /* reversed: Ctrl + click, which does the opposite of Settings → Notes → Open notes in. */
  const openNote = (id: string, reversed = false) => (opensInNewTab(reversed) ? openInNewTab({ kind: 'note', id }) : go({ kind: 'note', id }));

  /* Select the placeholder title so typing replaces it straight away. */
  function focusTitle(tabId = activeTab(group).id) {
    requestAnimationFrame(() => {
      const title = document.querySelector<HTMLInputElement>(`[data-tab="${tabId}"] .note-title-input`);
      title?.focus();
      title?.select();
    });
  }

  /* A new note starts in the category being viewed or filtered, if there is one. It opens in a */
  /* new tab when Settings → Notes → Open notes in asks for that. */
  function newNote(category?: string, groupId = group.id, tab = activeTab(group), kind: NoteKind = 'document') {
    flushSave();
    const filtered = noteFilter === 'all' ? '' : noteFilter;
    const shown = currentPlace(tab);
    const viewed = shown.kind === 'category' ? shown.id : '';
    const note = createNote(category ?? (viewed || filtered), '', kind);
    if (opensInNewTab(false, true)) {
      focusTitle(openInNewTab({ kind: 'note', id: note.id }, true));
      return;
    }
    go({ kind: 'note', id: note.id }, groupId, tab.id);
    focusTitle(tab.id);
  }

  /* Ctrl + click or double-click on a page link opens the page in a new tab. */
  const openNoteInNewTab = (id: string) => openInNewTab({ kind: 'note', id });

  /* Closed tabs, newest last, so Ctrl + Shift + T can bring them back like a browser. */
  const closedTabs = useRef<ClosedTab[]>([]);

  function closeTabIn(groupId: string, tabId: string) {
    const owner = tabs.groups.find(item => item.id === groupId);
    const index = owner ? owner.tabs.findIndex(tab => tab.id === tabId) : -1;
    if (owner && index >= 0) closedTabs.current = [...closedTabs.current, { tab: owner.tabs[index], groupId, index }].slice(-CLOSED_TAB_LIMIT);
    changeTabs(current => closeTab(current, groupId, tabId));
  }

  /* The last closed tab comes back where it was (see reopenLastClosed). With no room for it, it */
  /* stays on the list for next time and a message says why. */
  function reopenClosedTab() {
    const result = reopenLastClosed(tabs, closedTabs.current, placeExists);
    closedTabs.current = result.closed;
    if (result.blocked) {
      showToast({ kind: 'error', title: 'No room to reopen the tab', description: `A stack holds ${STACK_LIMIT} tabs. Close one, then try again.` });
      return;
    }
    if (result.workspace === tabs) return;
    setScreenId('notes');
    changeTabs(() => result.workspace);
  }

  /* Tab ids, the most recently shown first, for Ctrl + Q's switcher (see moveSwitcher). */
  const recentTabs = useRef<string[]>([]);
  const shownTab = activeTab(group).id;
  useEffect(() => {
    recentTabs.current = [shownTab, ...recentTabs.current.filter(id => id !== shownTab)];
  }, [shownTab]);

  /* The switcher while Ctrl is held after Ctrl + Q: the tabs it lists and the one picked. */
  const [switcher, setSwitcher] = useState<{ ids: string[]; selected: number } | null>(null);
  const allTabs = tabs.groups.flatMap(item => item.tabs);
  useEscape(switcher !== null, () => setSwitcher(null));

  function switchTo(id: string) {
    setSwitcher(null);
    const owner = tabs.groups.find(item => item.tabs.some(tab => tab.id === id));
    if (!owner) return;
    setScreenId('notes');
    changeTabs(current => selectTab(current, owner.id, id));
  }

  /* Like Alt + Tab, for tabs: Ctrl + Q lists every tab, the most recently used first, with the one */
  /* used before this one picked, so a quick Ctrl + Q goes back to it. Each further Q (or ↓) picks */
  /* the next one, ↑ the one before; letting go of Ctrl or Enter switches. Shift + Q is left alone: */
  /* Ctrl + Shift + Q quits Chrome and Edge, and a page cannot stop it. */
  function moveSwitcher(direction: -1 | 1) {
    if (!switcher) {
      const open = allTabs.map(tab => tab.id);
      const ids = [...recentTabs.current.filter(id => open.includes(id)), ...open.filter(id => !recentTabs.current.includes(id))];
      if (ids.length > 1) setSwitcher({ ids, selected: direction === 1 ? 1 : ids.length - 1 });
      return;
    }
    setSwitcher({ ...switcher, selected: (switcher.selected + direction + switcher.ids.length) % switcher.ids.length });
  }

  /* Turning a space off in Settings closes it: Boardspace gives way to the tabs, and tabs that */
  /* have shown Notespace's pages start over on Starjot Home, so Back cannot lead into it. */
  useEffect(() => {
    if (!spaces.boardspace && screenId === 'boardspace') setScreenId('notes');
    if (spaces.notes) return;
    closedTabs.current = [];
    if (tabs.groups.some(item => item.tabs.some(tab => tab.history.some(shown => shown.kind !== 'start')))) {
      flushSave();
      setTabs(newWorkspace({ kind: 'start' }));
    }
  }, [spaces.notes, spaces.boardspace]);

  /* Clicking or tabbing into a group makes it the focused group. */
  function focusOn(groupId: string) {
    if (tabs.focus !== groupId) setTabs(current => focusGroup(current, groupId));
  }

  /* The browser's address follows the place shown (see address.ts). Going somewhere new adds a */
  /* step to the browser's history; switching tabs, or the first address, only replaces it, as */
  /* switching browser tabs is not a step either. */
  const pageUrl = (hash: string) => window.location.pathname + window.location.search + hash;
  const address = addressOf(screenId === 'boardspace' ? { kind: 'board', view: workTab } : { kind: 'place', place });
  const tabKey = `${tabs.focus}:${activeTab(group).id}`;
  const synced = useRef({ address: '', tabKey: '' });
  useEffect(() => {
    const last = synced.current;
    synced.current = { address, tabKey };
    if (window.location.hash === address) return;
    if (!last.address || last.tabKey !== tabKey) window.history.replaceState(null, '', pageUrl(address));
    else window.history.pushState(null, '', pageUrl(address));
  }, [address, tabKey]);

  /* Back and Forward (the browser's buttons, Alt + arrows, a mouse's side buttons, a phone's back */
  /* gesture), or an address typed in. An open window (Search, Settings, the sidebar popup) closes */
  /* first and the page stays. Otherwise the tab shown steps back or forward when that is where */
  /* the address leads, or goes there. */
  useEffect(() => {
    function handlePopState() {
      if (searchState || settingsOpen || popup) {
        setSearchState(null);
        setSettingsOpen(false);
        setPopup(null);
        window.history.pushState(null, '', pageUrl(address));
        return;
      }
      const target = parseAddress(window.location.hash) ?? { kind: 'place' as const, place: { kind: 'start' as const } };
      flushSave();
      if (target.kind === 'board' && spaces.boardspace) {
        setScreenId('boardspace');
        setWorkTab(target.view);
        return;
      }
      if (target.kind === 'board' || !placeAllowed(target.place, spaces)) {
        window.history.replaceState(null, '', pageUrl(address));
        return;
      }
      setScreenId('notes');
      const block = blockInAddress(window.location.hash);
      if (block && target.place.kind === 'note') revealWhenShown(target.place.id, block);
      const tab = activeTab(group);
      changeTab(group.id, tab.id, current => {
        const back = stepPlace(current, -1, placeExists);
        const forward = stepPlace(current, 1, placeExists);
        if (back && samePlace(back, target.place)) return step(current, -1, placeExists);
        if (forward && samePlace(forward, target.place)) return step(current, 1, placeExists);
        return goTo(current, target.place);
      });
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  });

  /* In Notespace, DocumentTitle names the browser tab after the focused page instead. */
  useEffect(() => {
    if (screenId !== 'notes') document.title = `${screenLabel(screenId)} — Starjot`;
  }, [screenId]);

  /* The short delays stop the sidebar from popping up when the pointer only passes by, and hover */
  /* is ignored while a mouse button is held (selecting text, drawing or dragging a tab). */
  function startPopup(event: MouseEvent) {
    window.clearTimeout(popupTimer.current);
    if (docked || event.buttons !== 0) return;
    popupTimer.current = window.setTimeout(() => setPopup(current => current ?? 'hover'), 180);
  }

  function cancelPopupTimer() {
    window.clearTimeout(popupTimer.current);
  }

  function endPopup() {
    window.clearTimeout(popupTimer.current);
    popupTimer.current = window.setTimeout(() => setPopup(current => (current === 'hover' ? null : current)), 280);
  }

  function togglePopup() {
    window.clearTimeout(popupTimer.current);
    setPopup(current => (current === 'click' ? null : 'click'));
  }

  /* The sidebar button (and Ctrl + \) docks or undocks the sidebar, like Notion. Narrow windows */
  /* have no room to dock, so there it keeps the popup open instead. */
  function toggleSidebar() {
    if (roomToDock) updatePreferences({ sidebarCollapsed: docked });
    else togglePopup();
  }

  const closePopup = useCallback(() => setPopup(null), []);
  useDismiss(popup !== null, '.sidebar, .sidebar-button', closePopup);

  useEffect(() => {
    if (docked) setPopup(null);
  }, [docked]);

  /* Choosing something in the popup closes it, like a menu. */
  function fromSidebar<T extends unknown[]>(action: (...args: T) => void) {
    return (...args: T) => {
      setPopup(null);
      action(...args);
    };
  }

  function openSearch(query = '', tabGroup: string | null = null) {
    setPopup(null);
    setSearchState({ query, tabGroup });
  }

  /* Opens a place from search: in a new tab of the group whose + opened search (shown), in a new */
  /* tab of the focused group (Ctrl + Enter; shown when just made, else as focusNewTabs says), or */
  /* here. A group with no room for a tab opens it here. */
  function openFromSearch(place: Place, inNewTab: boolean, created = false) {
    const groupId = searchState?.tabGroup ?? (inNewTab ? group.id : null);
    const target = groupId ? tabs.groups.find(item => item.id === groupId) : null;
    if (!target || !canAddTab(target)) {
      go(place);
      return null;
    }
    const tab = newTab(place);
    addNewTab(target.id, tab, Boolean(searchState?.tabGroup) || created || getPreferences().focusNewTabs);
    return tab;
  }

  /* A note found in its text opens with the find bar showing the words. If the note was already */
  /* open there, nothing new opens, so the words are dropped rather than kept for later. */
  function openFoundNote(id: string, inNewTab: boolean, findTerm: string) {
    findWhenOpened(id, findTerm);
    openFromSearch({ kind: 'note', id }, opensInNewTab(inNewTab));
    window.setTimeout(() => findWhenOpened('', ''));
  }

  /* "Create new note" (or canvas) in search: what was typed becomes the title; with nothing typed, */
  /* the title is selected, ready to type. */
  function createFromSearch(title: string, category: string, inNewTab: boolean, kind: NoteKind) {
    flushSave();
    const note = createNote(category, '', kind);
    if (title) updateNote(note.id, { title });
    const tab = openFromSearch({ kind: 'note', id: note.id }, opensInNewTab(inNewTab, true), true);
    if (!title) focusTitle(tab?.id ?? activeTab(group).id);
  }

  /* Home shows Starjot Home in the current tab, so Back returns to where you were. */
  const goHome = fromSidebar(() => go({ kind: 'start' }));

  /* Shown in the tab bar (or top bar) while floating, and at the top of the sidebar while docked, */
  /* in the same corner either way. */
  const windowControls = (
    <WindowControls sidebarOpen={docked || popup !== null} onHome={goHome} onToggleSidebar={toggleSidebar} onSidebarHover={startPopup} onSidebarLeave={endPopup} onNewNote={spaces.notes ? fromSidebar(() => newNote()) : undefined} onOpenNote={spaces.notes ? fromSidebar(openNote) : undefined} />
  );

  /* The app-wide shortcuts (shortcuts.ts; their keys can be changed in Settings). By default: */
  /* Ctrl + K opens search, Ctrl + N creates a note while in Notespace, and Ctrl + \ docks or */
  /* undocks the sidebar. Tabs work like a browser's: Ctrl + T opens search for a new tab, Ctrl + W */
  /* closes the current tab (or the open search or settings), Ctrl + Shift + T brings back the */
  /* last closed tab, and Ctrl + Tab / Ctrl + Shift + Tab go to the next / previous tab. In a */
  /* browser tab the browser keeps these for itself; they reach the app in the desktop app. */
  /* Ctrl + Q works in both: it opens the tab switcher (see moveSwitcher), and letting go of its */
  /* held key switches. Pending edits are saved when the page is hidden. */
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (switcher && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        moveSwitcher(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (switcher && event.key === 'Enter') {
        event.preventDefault();
        switchTo(switcher.ids[switcher.selected]);
        return;
      }
      const handled = [
        ['switcher', () => moveSwitcher(1)],
        ['nextTab', () => screenId === 'notes' && !searchState && !settingsOpen && changeTabs(current => cycleTab(current, 1))],
        ['previousTab', () => screenId === 'notes' && !searchState && !settingsOpen && changeTabs(current => cycleTab(current, -1))],
        ['search', () => openSearch()],
        ['newNote', () => screenId === 'notes' && spaces.notes && newNote()],
        ['reopenTab', reopenClosedTab],
        ['newTab', () => {
          setScreenId('notes');
          openSearch('', group.id);
        }],
        ['closeTab', () => {
          if (searchState || settingsOpen) {
            setSearchState(null);
            setSettingsOpen(false);
          } else if (screenId === 'notes') {
            closeTabIn(group.id, activeTab(group).id);
          }
        }],
        ['sidebar', toggleSidebar]
      ] as const;
      const found = handled.find(([id]) => isShortcut(event, id));
      if (!found) return;
      event.preventDefault();
      found[1]();
    }
    function handleKeyUp(event: KeyboardEvent) {
      if (switcher && event.key === switcherModifier()) switchTo(switcher.ids[switcher.selected]);
    }
    function handleHidden() {
      if (document.visibilityState === 'hidden') flushSave();
    }

    /* Leaving the window while Ctrl is held never sends its release, so the switcher just closes. */
    function closeSwitcher() {
      setSwitcher(null);
    }
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('visibilitychange', handleHidden);
    window.addEventListener('pagehide', flushSave);
    window.addEventListener('blur', closeSwitcher);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('visibilitychange', handleHidden);
      window.removeEventListener('pagehide', flushSave);
      window.removeEventListener('blur', closeSwitcher);
    };
  });

  /* Everything one tab needs: its own history and navigation, and the controls for splitting and stacking. */
  function renderTab(tabGroup: TabGroup, tab: NoteTab) {
    const shown = currentPlace(tab);
    const goHere = (next: Place) => go(next, tabGroup.id, tab.id);
    const goBack = () => changeTab(tabGroup.id, tab.id, item => step(item, -1, placeExists));
    const history: PageHistory = {
      back: stepPlace(tab, -1, placeExists),
      forward: stepPlace(tab, 1, placeExists),
      onBack: goBack,
      onForward: () => changeTab(tabGroup.id, tab.id, item => step(item, 1, placeExists))
    };

    /* Each action starts from this tab, so it splits or stacks the page shown here. */
    const fromHere = (change: (current: Workspace) => Workspace) => changeTabs(current => change(selectTab(current, tabGroup.id, tab.id)));
    const view: ViewControls = {
      split: isSplit(tabs) ? tabs.direction : null,
      stacked: tabGroup.stacked,
      tabCount: tabGroup.tabs.length,
      canStack: canStack(tabGroup),
      canUnsplit: isSplit(tabs) || tabGroup.stacked,
      onSplit: direction => fromHere(current => splitWorkspace(current, direction)),
      onStack: () => fromHere(stackGroup),
      onUnsplit: () => changeTabs(unsplit)
    };
    /* Each opens here, or in a new tab when asked (Ctrl + click). */
    const openPlace = (next: Place, inNewTab = false) => (inNewTab ? openInNewTab(next) : goHere(next));
    const openHere = (id: string, reversed = false) => openPlace({ kind: 'note', id }, opensInNewTab(reversed));
    const openCategory = (id: string, inNewTab = false) => openPlace({ kind: 'category', id }, inNewTab);
    const openHome = (inNewTab = false) => openPlace({ kind: 'home' }, inNewTab);

    /* Leaving a page (Escape, or deleting the note) goes back, or to the notes home when there is no back. */
    const closePage = () => (history.back ? goBack() : openHome());

    /* A sub-page added from the slash menu opens straight away with its title selected (in a new */
    /* tab when new notes open in one). With Settings → Notes → Open new sub-notes off, NoteEditor */
    /* names it in the parent note instead. */
    const openNewPage = (id: string) => {
      if (opensInNewTab(false, true)) {
        focusTitle(openInNewTab({ kind: 'note', id }, true));
        return;
      }
      goHere({ kind: 'note', id });
      focusTitle(tab.id);
    };

    let screen: ReactNode;
    if (shown.kind === 'note') {
      screen = (
        <NoteEditor
          key={shown.id}
          noteId={shown.id}
          tabId={tab.id}
          history={history}
          view={view}
          active={tabGroup.id === tabs.focus && tab.id === tabGroup.active}
          onClose={closePage}
          onOpenNote={openHere}
          onOpenNoteInNewTab={openNoteInNewTab}
          onGoToNote={id => goHere({ kind: 'note', id })}
          onOpenCategory={openCategory}
          onOpenHome={openHome}
          onOpenNewPage={openNewPage}
          onOpenSettings={openSettings}
          onOpenWorkItem={item => {
            openBoardView(item.type === 'epic' ? 'list' : 'board');
            openWorkItem(item.id);
          }}
        />
      );
    } else if (shown.kind === 'category') {
      screen = (
        <>
          <PageBar history={history}>
            <Breadcrumb items={[{ key: 'home', label: 'Notespace', open: openHome }, { key: shown.id, label: placeLabel(shown) }]} />
          </PageBar>
          <CategoryPage key={shown.id} categoryId={shown.id} onBack={closePage} onOpen={openHere} onOpenInNewTab={openNoteInNewTab} onCreate={(category, kind) => newNote(category, tabGroup.id, tab, kind)} />
        </>
      );
    } else if (shown.kind === 'start') {
      screen = (
        <>
          <PageBar history={history}>
            <Breadcrumb items={[{ key: 'start', label: 'Home' }]} />
          </PageBar>
          <StarjotHome onOpenNote={openHere} onOpenNotespace={openHome} onOpenBoardspace={() => navigate('boardspace')} onOpenBoardView={openBoardView} />
        </>
      );
    } else {
      screen = (
        <>
          <PageBar history={history}>
            <Breadcrumb items={[{ key: 'home', label: 'Notespace' }]} />
          </PageBar>
          <NotesHome filter={noteFilter} onFilterChange={setNoteFilter} onOpen={openHere} onOpenInNewTab={openNoteInNewTab} onOpenCategory={openCategory} onCreate={kind => newNote(undefined, tabGroup.id, tab, kind)} />
        </>
      );
    }
    return <div className="main-scroll" data-tab={tab.id}>{screen}</div>;
  }

  /* Each tab group has its own tab strip above its pages. A normal group shows its active tab; a */
  /* stacked group shows every tab as a strip with its title (and a close button), with two of them */
  /* open beside their strips. Tabs are keyed by id in every layout, so stacking keeps the open note */
  /* as it is, undo history included, and a folded stacked tab stays open behind its strip. */
  /* Window buttons (close, minimise), once the app has them, belong only in the tab strip at the */
  /* top-right of the window, not in every group's strip. */
  let screen;
  if (screenId === 'notes') {
    screen = (
      <div className={`tab-layout is-split-${tabs.direction}`}>
        {tabs.groups.map(tabGroup => (
          <TabGroupFrame
            key={tabGroup.id}
            group={tabGroup}
            focused={tabGroup.id === tabs.focus}
            onFocus={() => focusOn(tabGroup.id)}
            onDropTab={(fromId, tabId, beforeId) => changeTabs(current => moveTab(current, fromId, tabId, tabGroup.id, beforeId))}
            canSplit={canSplit(tabs)}
            onSplitTab={(fromId, tabId, side) => changeTabs(current => splitWithTab(current, fromId, tabId, side))}
            onDropNote={(noteId, beforeId) => {
              if (!getNote(noteId) || !canAddTab(tabGroup)) return;
              const added = newTab({ kind: 'note', id: noteId });
              setScreenId('notes');
              changeTabs(current => {
                const opened = addTab(current, tabGroup.id, added);
                return beforeId ? moveTab(opened, tabGroup.id, added.id, tabGroup.id, beforeId) : opened;
              });
            }}
          >
            <WindowBar
              group={tabGroup}
              leading={!docked && tabGroup.id === tabs.groups[0].id ? windowControls : null}
              onSelect={id => changeTabs(current => selectTab(current, tabGroup.id, id))}
              onClose={id => closeTabIn(tabGroup.id, id)}
              onNew={() => openSearch('', tabGroup.id)}
            />
            <div className="tab-group-body">
              {tabGroup.tabs.map((tab, index) => {
                const isActive = tab.id === tabGroup.active;
                if (!tabGroup.stacked && !isActive) return null;
                const folded = tabGroup.stacked && !isOpenInStack(tabGroup, index);
                return (
                  <div
                    key={tab.id}
                    className={`group-tab ${isActive ? 'is-active' : ''} ${folded ? 'is-folded' : ''}`}
                    onMouseDownCapture={() => {
                      if (!isActive || tabs.focus !== tabGroup.id) setTabs(current => selectTab(current, tabGroup.id, tab.id));
                    }}
                  >
                    {tabGroup.stacked && (
                      <StackSpine
                        groupId={tabGroup.id}
                        tabId={tab.id}
                        place={currentPlace(tab)}
                        active={isActive}
                        onSelect={() => changeTabs(current => selectTab(current, tabGroup.id, tab.id))}
                        onClose={() => closeTabIn(tabGroup.id, tab.id)}
                      />
                    )}
                    {renderTab(tabGroup, tab)}
                  </div>
                );
              })}
            </div>
          </TabGroupFrame>
        ))}
      </div>
    );
  } else {
    screen = <div className="main-scroll"><Boardspace tab={workTab} onTabChange={setWorkTab} onOpenNote={id => openInNewTab({ kind: 'note', id })} /></div>;
  }

  return (
    <div className={`app-shell ${screenId === 'notes' ? 'app-shell--notespace' : ''} ${docked ? '' : 'sidebar-floating'} ${popup ? 'sidebar-open' : ''}`}>
      {!docked && <div className="sidebar-hover-zone" aria-hidden="true" onMouseEnter={startPopup} onMouseLeave={cancelPopupTimer} />}
      {/* The first thing the keyboard reaches: it skips the sidebar and goes to the page. */}
      <button type="button" className="skip-link" onClick={() => document.getElementById('main-content')?.focus()}>Skip to content</button>
      <Sidebar
        screen={screenId}
        space={screenId}
        openNoteId={screenId === 'notes' && place.kind === 'note' ? place.id : null}
        openCategoryId={screenId === 'notes' && place.kind === 'category' ? place.id : null}
        onOpenCategory={fromSidebar((id: string, inNewTab = false) => (inNewTab ? openInNewTab({ kind: 'category', id }) : go({ kind: 'category', id })))}
        boardView={screenId === 'boardspace' ? workTab : null}
        docked={docked}
        onNavigate={fromSidebar(navigate)}
        onOpenNote={fromSidebar(openNote)}
        onOpenBoardView={fromSidebar(openBoardView)}
        controls={windowControls}
        onSearch={openSearch}
        settingsOpen={settingsOpen}
        onSettings={fromSidebar(() => openSettings())}
        onMouseEnter={cancelPopupTimer}
        onMouseLeave={() => {
          if (!docked) endPopup();
        }}
      />
      <div className="main-column" id="main-content" tabIndex={-1}>
        <Topbar screen={screenId} controls={docked ? null : windowControls} />
        {screenId === 'notes' && <DocumentTitle place={place} />}
        {screen}
      </div>
      <MobileNav screen={screenId} homeShown={screenId === 'notes' && place.kind === 'start'} settingsOpen={settingsOpen} onNavigate={navigate} onHome={goHome} onSearch={() => openSearch()} onSettings={() => openSettings()} />
      {settingsOpen && (
        <Settings
          section={settingsSection}
          onSectionChange={setSettingsSection}
          onClose={() => setSettingsOpen(false)}
          focus={settingsFocus}
          onFocused={clearSettingsFocus}
        />
      )}
      {switcher && (
        <TabSwitcher
          tabs={switcher.ids.flatMap(id => allTabs.filter(tab => tab.id === id))}
          selected={switcher.selected}
          onPick={switchTo}
        />
      )}
      {searchState && (
        <SearchWindow
          initialQuery={searchState.query}
          inNewTab={searchState.tabGroup !== null}
          onClose={() => setSearchState(null)}
          onOpenNote={openFoundNote}
          onCreateNote={createFromSearch}
          onOpenCategory={(id, inNewTab) => openFromSearch({ kind: 'category', id }, inNewTab)}
          onOpenBoardView={openBoardView}
        />
      )}
      <TrashPopup />
      <Toaster />
      {spaces.notes && <ReminderWatcher onOpenNote={openNote} />}
    </div>
  );
}
