import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { usePreferences } from './preferences';
import { MobileNav, Sidebar, Topbar } from './Shell';
import { CategoryPage } from '../notespace/CategoryPage';
import { NotesHome, type NoteFilter } from '../notespace/NotesHome';
import { NoteEditor } from '../notespace/editor/NoteEditor';
import { PageBar, placeExists, placeLabel, type PageHistory } from '../notespace/PageBar';
import { createNote, flushSave } from '../notespace/store';
import { Settings, type SettingsSection } from '../settings/Settings';
import { Workboard } from '../workboard/Workboard';
import type { BoardTab } from '../../shared/types/task';
import { closeTab, currentPlace, goTo, newTab, step, stepPlace, type NoteTab, type Place } from './noteTabs';
import { WindowBar } from './WindowBar';
import { workspaceLabel, type WorkspaceId } from './workspaces';


/* =========================
   Application
   ========================= */

/* Only navigation lives here; note content belongs to the Notespace store. */
export function App() {
  const [workspace, setWorkspace] = useState<WorkspaceId>('notes');

  /* The open tabs in Notespace, each with its own back and forward history, and the one being shown. */
  const [tabState, setTabState] = useState(() => {
    const first = newTab({ kind: 'home' });
    return { tabs: [first], active: first.id };
  });
  const [workTab, setWorkTab] = useState<BoardTab>('todo');
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general');
  const [noteFilter, setNoteFilter] = useState<NoteFilter>('all');
  const { sidebarCollapsed } = usePreferences();

  /* A hidden sidebar "peeks" out when the pointer rests at the left edge of the window. */
  const [peeking, setPeeking] = useState(false);
  const peekTimer = useRef<number | undefined>(undefined);

  const activeTab = tabState.tabs.find(tab => tab.id === tabState.active) ?? tabState.tabs[0];
  const place = currentPlace(activeTab);

  /* Change the active tab, saving pending edits first and starting the new page at its top. */
  function updateActiveTab(change: (tab: NoteTab) => NoteTab | null) {
    const next = change(activeTab);
    if (!next || next === activeTab) return;
    flushSave();
    setTabState(state => ({ ...state, tabs: state.tabs.map(tab => (tab.id === next.id ? next : tab)) }));
    scrollToTop();
  }

  function go(next: Place) {
    setWorkspace('notes');
    updateActiveTab(tab => goTo(tab, next));
  }

  function navigate(next: WorkspaceId) {
    flushSave();
    setWorkspace(next);
    if (next === 'notes') go({ kind: 'home' });
  }

  function scrollToTop() {
    requestAnimationFrame(() => document.getElementById('main-scroll')?.scrollTo(0, 0));
  }

  const goBack = () => updateActiveTab(tab => step(tab, -1, placeExists));
  const goForward = () => updateActiveTab(tab => step(tab, 1, placeExists));
  const history: PageHistory = {
    back: stepPlace(activeTab, -1, placeExists),
    forward: stepPlace(activeTab, 1, placeExists),
    onBack: goBack,
    onForward: goForward
  };

  const openNote = (id: string) => go({ kind: 'note', id });
  const openCategory = (id: string) => go({ kind: 'category', id });
  const openHome = () => go({ kind: 'home' });

  /* Leaving a page (Escape, or deleting the note) goes back, or to the notes home when there is no back. */
  function closePage() {
    if (history.back) goBack();
    else openHome();
  }

  /* A sub-page added from the slash menu opens straight away with its title selected. */
  function openNewPage(id: string) {
    openNote(id);
    focusTitle();
  }

  /* Select the placeholder title so typing replaces it straight away. */
  function focusTitle() {
    requestAnimationFrame(() => {
      const title = document.getElementById('note-title') as HTMLInputElement | null;
      title?.focus();
      title?.select();
    });
  }

  /* A new note starts in the category being viewed or filtered, if there is one. */
  function newNote(category?: string) {
    flushSave();
    const filtered = noteFilter === 'all' ? '' : noteFilter;
    const viewed = place.kind === 'category' ? place.id : '';
    openNote(createNote(category ?? (viewed || filtered)).id);
    focusTitle();
  }

  /* The + beside the tabs starts a new note in a new tab. */
  function newNoteTab() {
    flushSave();
    const tab = newTab({ kind: 'note', id: createNote().id });
    setTabState(state => ({ tabs: [...state.tabs, tab], active: tab.id }));
    focusTitle();
  }

  function selectTab(id: string) {
    flushSave();
    setTabState(state => ({ ...state, active: id }));
  }

  function removeTab(id: string) {
    flushSave();
    setTabState(state => closeTab(state.tabs, state.active, id));
  }

  /* In Notespace the window bar names the browser tab after the open page instead. */
  useEffect(() => {
    if (workspace !== 'notes') document.title = `${workspaceLabel(workspace)} — Starjot`;
  }, [workspace]);

  /* The short delays stop the sidebar from popping up when the pointer only passes the edge, */
  /* and ignore the edge entirely while a mouse button is held (selecting text or dragging blocks). */
  function startPeek(event: MouseEvent) {
    window.clearTimeout(peekTimer.current);
    if (event.buttons !== 0) return;
    peekTimer.current = window.setTimeout(() => setPeeking(true), 180);
  }

  function cancelPeek() {
    window.clearTimeout(peekTimer.current);
  }

  function endPeek() {
    window.clearTimeout(peekTimer.current);
    if (peeking) peekTimer.current = window.setTimeout(() => setPeeking(false), 280);
  }

  useEffect(() => {
    if (!sidebarCollapsed) setPeeking(false);
  }, [sidebarCollapsed]);

  /* Ctrl + N creates a note while in Notespace; pending edits are saved when the page is hidden. */
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n' && workspace === 'notes') {
        event.preventDefault();
        newNote();
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

  let screen;
  if (workspace === 'notes') {
    if (place.kind === 'note') {
      screen = (
        <NoteEditor
          key={place.id}
          noteId={place.id}
          history={history}
          onClose={closePage}
          onOpenNote={openNote}
          onOpenCategory={openCategory}
          onOpenNewPage={openNewPage}
        />
      );
    } else if (place.kind === 'category') {
      screen = (
        <>
          <PageBar history={history}>
            <nav className="editor-breadcrumb" aria-label="Breadcrumb">
              <button type="button" className="editor-crumb-link" onClick={openHome}>All notes</button>
              <span className="editor-breadcrumb-separator">/</span>
              <span className="editor-crumb-current">{placeLabel(place)}</span>
            </nav>
          </PageBar>
          <CategoryPage key={place.id} categoryId={place.id} onBack={closePage} onOpen={openNote} onCreate={newNote} />
        </>
      );
    } else {
      screen = (
        <>
          <PageBar history={history}>
            <nav className="editor-breadcrumb" aria-label="Breadcrumb"><span className="editor-crumb-current">All notes</span></nav>
          </PageBar>
          <NotesHome filter={noteFilter} onFilterChange={setNoteFilter} onOpen={openNote} onOpenCategory={openCategory} onCreate={() => newNote()} />
        </>
      );
    }
  } else if (workspace === 'workboard') {
    screen = <Workboard tab={workTab} onTabChange={setWorkTab} />;
  } else {
    screen = <Settings section={settingsSection} onSectionChange={setSettingsSection} />;
  }

  return (
    <div className={`app-shell ${workspace === 'notes' ? 'app-shell--notespace' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${peeking ? 'sidebar-peek' : ''}`}>
      {sidebarCollapsed && <div className="sidebar-hover-zone" aria-hidden="true" onMouseEnter={startPeek} onMouseLeave={cancelPeek} />}
      <Sidebar
        workspace={workspace}
        openNoteId={workspace === 'notes' && place.kind === 'note' ? place.id : null}
        onNavigate={navigate}
        onOpenNote={openNote}
        onMouseEnter={cancelPeek}
        onMouseLeave={endPeek}
      />
      <div className="main-column">
        <Topbar workspace={workspace} />
        {workspace === 'notes' && <WindowBar tabs={tabState.tabs} active={activeTab.id} onSelect={selectTab} onClose={removeTab} onNew={newNoteTab} />}
        <div className="main-scroll" id="main-scroll">{screen}</div>
      </div>
      <MobileNav workspace={workspace} onNavigate={navigate} />
    </div>
  );
}
