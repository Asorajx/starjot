import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { changeZoom, usePreferences } from '../../app/preferences';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Icon } from '../../components/Icon';
import { childrenOf, deleteNote, flushSave, getNote, isStorageAvailable, updateNote, updatedLabel, useCategories, useNote, useSaveStatus } from '../store';
import type { NoteMode } from '../../../shared/types/note';
import { CodeLanguagePickers } from './CodeLanguagePickers';
import { CommentLayer } from './CommentLayer';
import { ContinuousEditor } from './ContinuousEditor';
import { PageOptions, TableOfContents } from './EditorPanels';
import { SelectionToolbar } from './SelectionToolbar';
import { SlashMenu } from './SlashMenu';
import { BlockWidgets } from './BlockWidgets';
import { NoteBreadcrumb } from './NoteBreadcrumb';
import { NoteHeader } from './NoteHeader';
import { EditorSession, useSessionValue } from './session';
import { StructuredEditor } from './StructuredEditor';

type Panel = 'toc' | 'options' | null;

type NoteEditorProps = {
  noteId: string;
  onClose: () => void;
  onOpenNote: (id: string) => void;
  onOpenCategory: (id: string) => void;

  /* Opens a sub-page just added with the slash menu, ready to be named. */
  onOpenNewPage: (id: string) => void;

  /* The page the back button returns to, such as "All notes" or a category name. */
  backLabel: string;
};



/* =========================
   Note Editor Screen
   ========================= */

export function NoteEditor({ noteId, onClose, onOpenNote, onOpenCategory, onOpenNewPage, backLabel }: NoteEditorProps) {
  const note = useNote(noteId);

  /* Re-render after each save, so the warning appears if the browser stops accepting saves. */
  useSaveStatus();

  /* Re-render when categories are renamed, so the breadcrumb stays current. */
  useCategories();
  const { zoom } = usePreferences();
  const [panel, setPanel] = useState<Panel>(null);
  const [switching, setSwitching] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLElement>(null);
  const locked = note?.locked ?? false;

  /* One editing session per open note: undo history, Sticky state and editor actions. */
  const session = useMemo(() => new EditorSession(noteId, getNote(noteId)?.content ?? ''), [noteId]);
  const { canUndo, canRedo, sticky } = useSessionValue(session, snapshot => snapshot);
  const revision = useSessionValue(session, snapshot => snapshot.revision);

  /* Save pending edits when leaving the note. */
  useEffect(() => () => flushSave(), [noteId]);

  /* Keyboard shortcuts for the whole editor screen. */
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return;
      const target = event.target as HTMLElement;
      const inField = Boolean(target.closest?.('input, textarea, select'));
      const inEditor = Boolean(target.closest?.('#note-body'));
      const key = event.key.toLowerCase();
      const command = (event.ctrlKey || event.metaKey) && !event.altKey;

      /* Escape closes an open panel first, then returns to the Notespace home page. */
      if (event.key === 'Escape') {
        event.preventDefault();
        if (panel) setPanel(null);
        else onClose();
        return;
      }

      /* Ctrl + = / Ctrl + − / Ctrl + 0 zoom the note instead of the whole window. */
      if (command && (key === '=' || key === '+' || key === '-' || key === '0')) {
        event.preventDefault();
        changeZoom(key === '0' ? 0 : key === '-' ? -1 : 1);
        return;
      }

      /* Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z use the note's history; the title field keeps its own undo. */
      if (command && (key === 'z' || key === 'y') && !inField) {
        event.preventDefault();
        if (locked) return;
        if (key === 'y' || event.shiftKey) session.redo();
        else session.undo();
        return;
      }

      /* Ctrl+A outside the text selects the note's text instead of the whole screen. */
      if (command && key === 'a' && !inField && !inEditor) {
        event.preventDefault();
        session.selectAll();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [panel, session, onClose, locked]);

  /* Ctrl + mouse wheel over the note zooms it. The listener is not passive so the page does not zoom. */
  useEffect(() => {
    const canvas = canvasRef.current;
    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      changeZoom(event.deltaY < 0 ? 1 : -1);
    }
    canvas?.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas?.removeEventListener('wheel', handleWheel);
  }, []);

  /* Clicking outside an open panel closes it. */
  useEffect(() => {
    if (!panel) return;
    function handleMouseDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('.editor-flyout, [data-panel-toggle]')) setPanel(null);
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [panel]);

  if (!note) return <p className="content-pad">This note is no longer available.</p>;

  function changeMode(mode: NoteMode) {
    if (!note || note.mode === mode) return;
    updateNote(note.id, { mode });
    setSwitching(true);
  }

  function removeNote() {
    setConfirmDelete(false);
    deleteNote(noteId);
    onClose();
  }

  const togglePanel = (name: Exclude<Panel, null>) => setPanel(current => (current === name ? null : name));

  /* Undo, redo and Sticky keep the editor's selection by ignoring the mouse press itself. */
  const keepSelection = (event: ReactMouseEvent) => event.preventDefault();

  return (
    <div className={`editor-wrap ${locked ? 'is-locked' : ''}`}>
      <div className="editor-toolbar">
        <button className="back-button" type="button" onClick={onClose}><Icon name="arrow-left" size={17} /> {backLabel}</button>
        <NoteBreadcrumb note={note} onOpenNote={onOpenNote} onOpenCategory={onOpenCategory} />
        <span className="editor-toolbar-fill" />
        {!isStorageAvailable() && <span className="saved-pill is-warning" id="note-save-state" role="status">Not saved</span>}

        <span className="note-history-buttons" role="group" aria-label="Undo and redo">
          <button type="button" className="btn note-toolbar-button note-icon-button" aria-label="Undo (Ctrl + Z)" disabled={!canUndo || locked} onMouseDown={keepSelection} onClick={() => session.undo()}>
            <Icon name="undo" size={17} />
          </button>
          <button type="button" className="btn note-toolbar-button note-icon-button" aria-label="Redo (Ctrl + Y)" disabled={!canRedo || locked} onMouseDown={keepSelection} onClick={() => session.redo()}>
            <Icon name="redo" size={17} />
          </button>
        </span>

        {/* Turns red ("Unstick") when the selection is inside one sticky group. */}
        <button
          type="button"
          className={`btn note-toolbar-button note-sticky-button ${sticky === 'unstick' ? 'is-unstick' : ''}`}
          aria-pressed={sticky === 'unstick'}
          aria-label={sticky === 'unstick' ? 'Unstick the selected group' : 'Sticky: keep the selected content together'}
          disabled={sticky === 'none' || locked}
          onMouseDown={keepSelection}
          onClick={() => session.toggleSticky()}
        >
          <Icon name="link" size={17} /><span>{sticky === 'unstick' ? 'Unstick' : 'Sticky'}</span>
        </button>

        <button type="button" data-panel-toggle className={`btn note-toolbar-button ${panel === 'toc' ? 'selected' : ''}`} aria-expanded={panel === 'toc'} aria-controls="note-toc-panel" onClick={() => togglePanel('toc')}>
          <Icon name="list" size={17} /><span>Contents</span>
        </button>
        <button type="button" data-panel-toggle className={`btn note-toolbar-button ${panel === 'options' ? 'selected' : ''}`} aria-expanded={panel === 'options'} aria-controls="note-preferences-panel" onClick={() => togglePanel('options')}>
          <Icon name="sliders-horizontal" size={17} /><span>Page options</span>
        </button>

        <TableOfContents content={note.content} open={panel === 'toc'} onClose={() => setPanel(null)} />
        <PageOptions
          note={note}
          open={panel === 'options'}
          zoom={zoom}
          onClose={() => setPanel(null)}
          onModeChange={changeMode}
          onStickyIndicatorChange={visible => updateNote(note.id, { stickyIndicator: visible })}
          onZoom={changeZoom}
          onLockChange={value => updateNote(note.id, { locked: value })}
          onDelete={() => { setPanel(null); setConfirmDelete(true); }}
        />
      </div>

      <div className="editor-layout">
        <main className="editor-canvas" id="note-top" ref={canvasRef}>
          {/* Zoom scales everything in the note, using the CSS zoom property. */}
          <div className="editor-width" style={{ zoom }}>
            <div className="editor-meta">
              <span className="page-type"><Icon name="file-text" size={14} /> DOCUMENT</span>
              {locked && <><span className="meta-dot">•</span><span className="page-locked"><Icon name="lock" size={12} /> Locked</span></>}
              <span className="meta-dot">•</span>
              <span id="note-updated-label">{updatedLabel(note)}</span>
            </div>
            <NoteHeader note={note} locked={locked} onOpenNote={onOpenNote} />
            <div className="article-rule" />

            {/* The key re-creates the editor after undo/redo or a mode change, so it shows the saved content. */}
            <div
              ref={contentRef}
              className={`note-content ${note.stickyIndicator ? '' : 'sticky-indicators-off'} ${switching ? 'is-switching' : ''}`}
              onAnimationEnd={() => setSwitching(false)}
            >
              {note.mode === 'continuous'
                ? <ContinuousEditor key={`continuous-${revision}`} session={session} content={note.content} locked={locked} />
                : <StructuredEditor key={`blocks-${revision}`} session={session} content={note.content} locked={locked} />}
              <CodeLanguagePickers session={session} containerRef={contentRef} locked={locked} />
              <CommentLayer session={session} comments={note.comments} containerRef={contentRef} />
            </div>
            <div className="document-end" id="note-bottom"><span /> END OF DOCUMENT <span /></div>
          </div>
        </main>
      </div>

      <SelectionToolbar session={session} locked={locked} />
      <SlashMenu session={session} noteId={note.id} locked={locked} onOpenNewPage={onOpenNewPage} />
      <BlockWidgets session={session} locked={locked} onOpenNote={onOpenNote} />

      {confirmDelete && (
        <ConfirmDialog title="Delete this note?" confirmLabel="Delete note" danger onConfirm={removeNote} onCancel={() => setConfirmDelete(false)}>
          <p><strong>{note.title || 'Untitled note'}</strong> will be removed from this browser. This cannot be undone.</p>
          {childrenOf(note.id).length > 0 && <p>Its {childrenOf(note.id).length} sub-page(s) will be kept and move up one level.</p>}
        </ConfirmDialog>
      )}
    </div>
  );
}
