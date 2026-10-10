import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { usePreferences } from './preferences';
import { MobileNav, Sidebar, Topbar } from './Shell';
import { CategoryPage } from '../notespace/CategoryPage';
import { NotesHome, type NoteFilter } from '../notespace/NotesHome';
import { NoteEditor } from '../notespace/editor/NoteEditor';
import { categoryName, createNote, createSubpage, flushSave, getNote } from '../notespace/store';
import { Settings, type SettingsSection } from '../settings/Settings';
import { Workboard } from '../workboard/Workboard';
import type { BoardTab } from '../../shared/types/task';
import { workspaceLabel, type WorkspaceId } from './workspaces';


/* =========================
   Application
   ========================= */

/* Only navigation lives here; note content belongs to the Notespace store. */
export function App() {
  const [workspace, setWorkspace] = useState<WorkspaceId>('notes');
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);

  /* Notes opened from inside other notes (a sub-page or breadcrumb link), so Back can return to them. */
  const [noteTrail, setNoteTrail] = useState<string[]>([]);

  /* The category page being shown, or null for the notes home. */
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const [workTab, setWorkTab] = useState<BoardTab>('todo');
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general');
  const [noteFilter, setNoteFilter] = useState<NoteFilter>('all');
  const { sidebarCollapsed } = usePreferences();

  /* A hidden sidebar "peeks" out when the pointer rests at the left edge of the window. */
  const [peeking, setPeeking] = useState(false);
  const peekTimer = useRef<number | undefined>(undefined);

  function navigate(next: WorkspaceId) {
    flushSave();
    setWorkspace(next);
    if (next === 'notes') {
      setOpenNoteId(null);
      setNoteTrail([]);
      setOpenCategoryId(null);
    }
  }

  function scrollToTop() {
    document.getElementById('main-scroll')?.scrollTo(0, 0);
  }

  /* Opening a note from a list starts a fresh trail. */
  function openNote(id: string) {
    setWorkspace('notes');
    setOpenNoteId(id);
    setNoteTrail([]);
    scrollToTop();
  }

  /* Opening a note from inside another note remembers the one being left. */
  function openLinkedNote(id: string) {
    flushSave();
    if (openNoteId && openNoteId !== id) setNoteTrail(trail => [...trail, openNoteId]);
    setOpenNoteId(id);
    scrollToTop();
  }

  /* Back returns to the previous note, or to the category page or notes home it was opened from. */
  function closeNote() {
    flushSave();
    const trail = noteTrail.filter(id => getNote(id));
    setOpenNoteId(trail[trail.length - 1] ?? null);
    setNoteTrail(trail.slice(0, -1));
    scrollToTop();
  }

  function addSubpage(parentId: string) {
    const page = createSubpage(parentId);
    if (!page) return;
    openLinkedNote(page.id);
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

  function openCategory(id: string) {
    flushSave();
    setWorkspace('notes');
    setOpenNoteId(null);
    setNoteTrail([]);
    setOpenCategoryId(id);
    scrollToTop();
  }

  /* A new note starts in the category being viewed or filtered, if there is one. */
  function newNote(category?: string) {
    flushSave();
    const filtered = noteFilter === 'all' ? '' : noteFilter;
    openNote(createNote(category ?? openCategoryId ?? filtered).id);
    focusTitle();
  }

  useEffect(() => {
    document.title = `${workspaceLabel(workspace)} — Starjot`;
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
    if (openNoteId) {
      const previous = getNote(noteTrail[noteTrail.length - 1] ?? '');
      const backLabel = previous ? previous.title || 'Untitled note' : openCategoryId ? categoryName(openCategoryId) : 'All notes';
      screen = (
        <NoteEditor
          key={openNoteId}
          noteId={openNoteId}
          onClose={closeNote}
          onOpenNote={openLinkedNote}
          onOpenCategory={openCategory}
          onAddSubpage={addSubpage}
          backLabel={backLabel}
        />
      );
    } else if (openCategoryId) {
      screen = <CategoryPage categoryId={openCategoryId} onBack={() => setOpenCategoryId(null)} onOpen={openNote} onCreate={newNote} />;
    } else {
      screen = <NotesHome filter={noteFilter} onFilterChange={setNoteFilter} onOpen={openNote} onOpenCategory={openCategory} onCreate={() => newNote()} />;
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
        openNoteId={workspace === 'notes' ? openNoteId : null}
        onNavigate={navigate}
        onOpenNote={openNote}
        onMouseEnter={cancelPeek}
        onMouseLeave={endPeek}
      />
      <div className="main-column">
        <Topbar workspace={workspace} />
        <div className="main-scroll" id="main-scroll">{screen}</div>
      </div>
      <MobileNav workspace={workspace} onNavigate={navigate} />
    </div>
  );
}
