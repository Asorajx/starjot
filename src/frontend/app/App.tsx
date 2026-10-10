import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { usePreferences } from './preferences';
import { MobileNav, Sidebar, Topbar } from './Shell';
import { NotesHome } from '../notespace/NotesHome';
import { NoteEditor } from '../notespace/editor/NoteEditor';
import { createNote, flushSave } from '../notespace/store';
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
  const [workTab, setWorkTab] = useState<BoardTab>('todo');
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general');
  const { sidebarCollapsed } = usePreferences();

  /* A hidden sidebar "peeks" out when the pointer rests at the left edge of the window. */
  const [peeking, setPeeking] = useState(false);
  const peekTimer = useRef<number | undefined>(undefined);

  function navigate(next: WorkspaceId) {
    flushSave();
    setWorkspace(next);
    if (next === 'notes') setOpenNoteId(null);
  }

  function openNote(id: string) {
    setWorkspace('notes');
    setOpenNoteId(id);
    document.getElementById('main-scroll')?.scrollTo(0, 0);
  }

  function newNote() {
    flushSave();
    openNote(createNote().id);

    /* Select the placeholder title so typing replaces it straight away. */
    requestAnimationFrame(() => {
      const title = document.getElementById('note-title') as HTMLInputElement | null;
      title?.focus();
      title?.select();
    });
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
    screen = openNoteId
      ? <NoteEditor key={openNoteId} noteId={openNoteId} onClose={() => navigate('notes')} />
      : <NotesHome onOpen={openNote} onCreate={newNote} />;
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
