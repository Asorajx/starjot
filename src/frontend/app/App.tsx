import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import { updatePreferences, usePreferences } from './preferences';
import { MobileNav, Sidebar, Topbar, WindowControls } from './Shell';
import { useDismiss } from '../lib/useDismiss';
import { useMediaQuery } from '../lib/useMediaQuery';
import { CategoryPage } from '../notespace/CategoryPage';
import { NotesHome, type NoteFilter } from '../notespace/NotesHome';
import { StarjotHome } from '../home/StarjotHome';
import { SearchWindow } from '../search/SearchWindow';
import { findWhenOpened } from '../notespace/editor/find/pendingFind';
import type { ViewControls } from '../notespace/editor/EditorPanels';
import { NoteEditor } from '../notespace/editor/NoteEditor';
import { PageBar, placeExists, placeLabel, type PageHistory } from '../notespace/PageBar';
import { createNote, flushSave, getNote, updateNote } from '../notespace/store';
import { Settings, type SettingsSection } from '../settings/Settings';
import { Boardspace } from '../boardspace/Boardspace';
import type { BoardTab } from '../../shared/types/task';
import {
  activeTab, addTab, canAddTab, canStack, closeTab, currentPlace, focusedGroup, focusGroup, goTo, isOpenInStack, isSplit, moveTab, newTab,
  newWorkspace, selectTab, splitWorkspace, stackGroup, step, stepPlace, unsplit, updateTab, type NoteTab, type Place, type TabGroup,
  type Workspace
} from './noteTabs';
import { DocumentTitle, StackSpine, TAB_DRAG_TYPE, WindowBar } from './WindowBar';
import { screenLabel, type ScreenId } from './screens';


/* =========================
   Tab Group Frame
   ========================= */

/* Below this width a stacked group has no room for two open tabs, so only its active tab is open. */
const TWO_OPEN_WIDTH = 760;

type TabGroupFrameProps = {
  group: TabGroup;
  focused: boolean;
  onFocus: () => void;

  /* A tab was dropped on this group: dropped on a tab (or its strip), it goes before that tab. */
  onDropTab: (fromGroupId: string, tabId: string, beforeTabId: string | null) => void;
  children: ReactNode;
};

/* The element around one tab group. It measures its own width (CSS cannot do this here: a CSS */
/* container would also move the note's floating toolbars), and marks itself narrow when needed. */
/* It also takes tabs dragged from either group. Drops are caught before they reach the note, so */
/* the editor never treats a dragged tab as text. */
function TabGroupFrame({ group, focused, onFocus, onDropTab, children }: TabGroupFrameProps) {
  const ref = useRef<HTMLElement>(null);
  const [narrow, setNarrow] = useState(false);
  const [dropping, setDropping] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setNarrow(element.clientWidth < TWO_OPEN_WIDTH));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const isTabDrag = (event: DragEvent) => event.dataTransfer.types.includes(TAB_DRAG_TYPE);

  function handleDragOver(event: DragEvent) {
    if (!isTabDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setDropping(true);
  }

  function handleDragLeave(event: DragEvent) {
    if (!ref.current?.contains(event.relatedTarget as Node | null)) setDropping(false);
  }

  function handleDrop(event: DragEvent) {
    if (!isTabDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setDropping(false);
    const { groupId, tabId } = JSON.parse(event.dataTransfer.getData(TAB_DRAG_TYPE)) as { groupId: string; tabId: string };
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
    </section>
  );
}


/* =========================
   Application
   ========================= */

/* Only navigation lives here; note content belongs to the Notespace store. */
export function App() {
  const [screenId, setScreenId] = useState<ScreenId>('notes');

  /* Notespace's tab groups (one, or two after a split), each with its tabs and their histories. */
  /* A page's own address (#note=id, see pageAddress) opens that page; anything else opens Starjot */
  /* Home. */
  const [tabs, setTabs] = useState<Workspace>(() => {
    const id = window.location.hash.match(/^#note=([a-zA-Z0-9_-]{1,90})$/)?.[1];
    if (id) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return newWorkspace(id && getNote(id) ? { kind: 'note', id } : { kind: 'start' });
  });
  const [workTab, setWorkTab] = useState<BoardTab>('todo');
  /* Settings is a panel over the app: open or not, the section shown, and a group to highlight. */
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general');
  const [settingsFocus, setSettingsFocus] = useState<string | null>(null);
  const clearSettingsFocus = useCallback(() => setSettingsFocus(null), []);
  const [noteFilter, setNoteFilter] = useState<NoteFilter>('all');
  const { sidebarCollapsed } = usePreferences();

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

  const openNote = (id: string) => go({ kind: 'note', id });

  /* Select the placeholder title so typing replaces it straight away. */
  function focusTitle(tabId = activeTab(group).id) {
    requestAnimationFrame(() => {
      const title = document.querySelector<HTMLInputElement>(`[data-tab="${tabId}"] .note-title-input`);
      title?.focus();
      title?.select();
    });
  }

  /* A new note starts in the category being viewed or filtered, if there is one. */
  function newNote(category?: string, groupId = group.id, tab = activeTab(group)) {
    flushSave();
    const filtered = noteFilter === 'all' ? '' : noteFilter;
    const shown = currentPlace(tab);
    const viewed = shown.kind === 'category' ? shown.id : '';
    go({ kind: 'note', id: createNote(category ?? (viewed || filtered)).id }, groupId, tab.id);
    focusTitle(tab.id);
  }

  /* Ctrl + click or double-click on a page link opens the page in a new tab beside the active one. */
  /* A full stack has no room for another tab, so the page opens in the active tab instead. */
  function openNoteInNewTab(id: string) {
    if (!canAddTab(group)) {
      openNote(id);
      return;
    }
    changeTabs(current => addTab(current, group.id, newTab({ kind: 'note', id }), true));
  }

  /* Clicking or tabbing into a group makes it the focused group. */
  function focusOn(groupId: string) {
    if (tabs.focus !== groupId) setTabs(current => focusGroup(current, groupId));
  }

  /* A page address entered while the app is open opens that page in the focused tab. */
  useEffect(() => {
    function handleHashChange() {
      const id = window.location.hash.match(/^#note=([a-zA-Z0-9_-]{1,90})$/)?.[1];
      if (!id) return;
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      if (getNote(id)) openNote(id);
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
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

  /* Opens a place from search: in a new tab of the group whose + opened search, in a new tab of */
  /* the focused group (Ctrl + Enter), or here. A group with no room for a tab opens it here. */
  function openFromSearch(place: Place, inNewTab: boolean) {
    const groupId = searchState?.tabGroup ?? (inNewTab ? group.id : null);
    const target = groupId ? tabs.groups.find(item => item.id === groupId) : null;
    if (!target || !canAddTab(target)) {
      go(place);
      return null;
    }
    setScreenId('notes');
    const tab = newTab(place);
    changeTabs(current => addTab(current, target.id, tab, true));
    return tab;
  }

  /* A note found in its text opens with the find bar showing the words. If the note was already */
  /* open there, nothing new opens, so the words are dropped rather than kept for later. */
  function openFoundNote(id: string, inNewTab: boolean, findTerm: string) {
    findWhenOpened(id, findTerm);
    openFromSearch({ kind: 'note', id }, inNewTab);
    window.setTimeout(() => findWhenOpened('', ''));
  }

  /* "Create new note" in search: what was typed becomes the title; with nothing typed, the title */
  /* is selected, ready to type. */
  function createFromSearch(title: string, category: string, inNewTab: boolean) {
    flushSave();
    const note = createNote(category);
    if (title) updateNote(note.id, { title });
    const tab = openFromSearch({ kind: 'note', id: note.id }, inNewTab);
    if (!title) focusTitle(tab?.id ?? activeTab(group).id);
  }

  /* Home shows Starjot Home in the current tab, so Back returns to where you were. */
  const goHome = fromSidebar(() => go({ kind: 'start' }));

  /* Shown in the tab bar (or top bar) while floating, and at the top of the sidebar while docked, */
  /* in the same corner either way. */
  const windowControls = (
    <WindowControls sidebarOpen={docked || popup !== null} onHome={goHome} onToggleSidebar={toggleSidebar} onSidebarHover={startPopup} onSidebarLeave={endPopup} onNewNote={fromSidebar(() => newNote())} />
  );

  /* Ctrl + K opens search, Ctrl + N creates a note while in Notespace, and Ctrl + \ docks or */
  /* undocks the sidebar. Alt is ignored because AltGr counts as Ctrl + Alt, and some keyboards */
  /* type \ with AltGr. Pending edits are saved when the page is hidden. */
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openSearch();
      } else if (event.key.toLowerCase() === 'n' && screenId === 'notes') {
        event.preventDefault();
        newNote();
      } else if (event.key === '\\') {
        event.preventDefault();
        toggleSidebar();
      }
    }
    function handleHidden() {
      if (document.visibilityState === 'hidden') flushSave();
    }
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('visibilitychange', handleHidden);
    window.addEventListener('pagehide', flushSave);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('visibilitychange', handleHidden);
      window.removeEventListener('pagehide', flushSave);
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
    const openHere = (id: string) => goHere({ kind: 'note', id });
    const openCategory = (id: string) => goHere({ kind: 'category', id });
    const openHome = () => goHere({ kind: 'home' });

    /* Leaving a page (Escape, or deleting the note) goes back, or to the notes home when there is no back. */
    const closePage = () => (history.back ? goBack() : openHome());

    /* A sub-page added from the slash menu opens straight away with its title selected. */
    const openNewPage = (id: string) => {
      openHere(id);
      focusTitle(tab.id);
    };

    let screen: ReactNode;
    if (shown.kind === 'note') {
      screen = (
        <NoteEditor
          key={shown.id}
          noteId={shown.id}
          history={history}
          view={view}
          active={tabGroup.id === tabs.focus && tab.id === tabGroup.active}
          onClose={closePage}
          onOpenNote={openHere}
          onOpenNoteInNewTab={openNoteInNewTab}
          onOpenCategory={openCategory}
          onOpenNewPage={openNewPage}
          onOpenSettings={openSettings}
        />
      );
    } else if (shown.kind === 'category') {
      screen = (
        <>
          <PageBar history={history}>
            <nav className="editor-breadcrumb" aria-label="Breadcrumb">
              <button type="button" className="editor-crumb-link" onClick={openHome}>Notespace</button>
              <span className="editor-breadcrumb-separator">/</span>
              <span className="editor-crumb-current">{placeLabel(shown)}</span>
            </nav>
          </PageBar>
          <CategoryPage key={shown.id} categoryId={shown.id} onBack={closePage} onOpen={openHere} onOpenInNewTab={openNoteInNewTab} onCreate={category => newNote(category, tabGroup.id, tab)} />
        </>
      );
    } else if (shown.kind === 'start') {
      screen = (
        <>
          <PageBar history={history}>
            <nav className="editor-breadcrumb" aria-label="Breadcrumb"><span className="editor-crumb-current">Home</span></nav>
          </PageBar>
          <StarjotHome onOpenNote={openHere} onOpenNotespace={openHome} onOpenBoardspace={() => navigate('boardspace')} onOpenBoardView={openBoardView} />
        </>
      );
    } else {
      screen = (
        <>
          <PageBar history={history}>
            <nav className="editor-breadcrumb" aria-label="Breadcrumb"><span className="editor-crumb-current">Notespace</span></nav>
          </PageBar>
          <NotesHome filter={noteFilter} onFilterChange={setNoteFilter} onOpen={openHere} onOpenInNewTab={openNoteInNewTab} onOpenCategory={openCategory} onCreate={() => newNote(undefined, tabGroup.id, tab)} />
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
          >
            <WindowBar
              group={tabGroup}
              leading={!docked && tabGroup.id === tabs.groups[0].id ? windowControls : null}
              onSelect={id => changeTabs(current => selectTab(current, tabGroup.id, id))}
              onClose={id => changeTabs(current => closeTab(current, tabGroup.id, id))}
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
                        onClose={() => changeTabs(current => closeTab(current, tabGroup.id, tab.id))}
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
    screen = <div className="main-scroll"><Boardspace tab={workTab} onTabChange={setWorkTab} /></div>;
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
    </div>
  );
}
