import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Icon } from '../../components/Icon';
import { isLocked, isTemporarilyUnlocked, setPinned } from '../store';
import { TEXT_LAYER } from './drawing/drawing';
import { useSessionValue, type EditorSession } from './session';
import type { Note } from '../../../shared/types/note';


/* =========================
   Shared by Documents and Canvases
   ========================= */

/* Whether the note is locked, and whether it is only unlocked for a short time. It locks itself */
/* again when that time is up, so the lock is checked again every few seconds while it runs. */
export function useNoteLock(note: Note | undefined) {
  const temporary = note ? isTemporarilyUnlocked(note) : false;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!temporary) return;
    const timer = window.setInterval(() => setTick(tick => tick + 1), 5000);
    return () => window.clearInterval(timer);
  }, [temporary]);
  return { locked: note ? isLocked(note) : false, temporary };
}

/* The drawing layer being drawn on. It starts as the top drawing layer, and moves to another one */
/* if it is removed (or undone away). */
export function useActiveLayer(note: Note | undefined) {
  const [chosen, setChosen] = useState('');
  const layers = note?.drawingLayers.filter(layer => layer.id !== TEXT_LAYER) ?? [];
  const active = layers.some(layer => layer.id === chosen) ? chosen : layers.at(-1)?.id ?? '';
  return [active, setChosen] as const;
}

/* Undo and redo in the page bar. They keep the editor's selection by ignoring the mouse press. */
export function UndoRedoButtons({ session, locked }: { session: EditorSession; locked: boolean }) {
  const { canUndo, canRedo } = useSessionValue(session, snapshot => snapshot);
  const keepSelection = (event: ReactMouseEvent) => event.preventDefault();
  return (
    <span className="page-bar-group" role="group" aria-label="Undo and redo">
      <button type="button" className="page-bar-button" data-tooltip="Undo" data-shortcut="Ctrl + Z" aria-label="Undo" disabled={!canUndo || locked} onMouseDown={keepSelection} onClick={() => session.undo()}>
        <Icon name="undo" size={17} />
      </button>
      <button type="button" className="page-bar-button" data-tooltip="Redo" data-shortcut="Ctrl + Y" aria-label="Redo" disabled={!canRedo || locked} onMouseDown={keepSelection} onClick={() => session.redo()}>
        <Icon name="redo" size={17} />
      </button>
    </span>
  );
}

/* Star or unstar the note; starred notes are listed in the sidebar and on the notes home page. */
export function NoteStarButton({ note }: { note: Note }) {
  return (
    <button
      type="button"
      className={`page-bar-button star-button ${note.pinned ? 'is-starred' : ''}`}
      aria-pressed={note.pinned}
      data-tooltip={note.pinned ? 'Unstar' : 'Star'}
      aria-label={note.pinned ? 'Unstar' : 'Star'}
      onClick={() => setPinned(note.id, !note.pinned)}
    >
      <Icon name="star" size={17} />
    </button>
  );
}
