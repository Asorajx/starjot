import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { NoteColorPicker } from '../NoteColors';
import { updateNote } from '../store';
import { copyPageLink } from '../editor/links/links';
import type { Note } from '../../../shared/types/note';


/* =========================
   Canvas Settings
   ========================= */

type CanvasSettingsProps = {
  id: string;
  note: Note;
  open: boolean;
  onClose: () => void;
  onDelete: () => void;
};

/* The settings of a canvas: the same panel as a document's Note settings, with only what a */
/* canvas has (no structure, layout or text size). */
export function CanvasSettings({ id, note, open, onClose, onDelete }: CanvasSettingsProps) {
  /* "Copied" shows until the panel is closed. */
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  return (
    <section className="editor-flyout note-settings-flyout" id={id} aria-label="Canvas settings" hidden={!open}>
      <div className="flyout-heading">
        <strong>Canvas settings</strong>
        <button type="button" className="flyout-close" aria-label="Close canvas settings" onClick={onClose}><Icon name="x" size={17} /></button>
      </div>

      <div className="option-grid">
        <button
          type="button"
          className={`option-tile ${copied ? 'selected' : ''}`}
          data-tooltip="Copies this canvas's address. Pasted into a note it becomes a link to this canvas; opened in a browser it opens this canvas."
          data-tooltip-align="start"
          data-tooltip-wrap=""
          onClick={() => copyPageLink(note.id).then(() => setCopied(true)).catch(() => undefined)}
        >
          <Icon name={copied ? 'check' : 'link'} size={16} /> {copied ? 'Copied' : 'Copy link'}
        </button>
        <button
          type="button"
          className={`option-tile ${note.locked ? 'selected' : ''}`}
          aria-pressed={note.locked}
          data-tooltip="A locked canvas can be looked around, but not drawn on."
          data-tooltip-align="end"
          data-tooltip-wrap=""
          onClick={() => updateNote(note.id, { locked: !note.locked })}
        >
          <Icon name={note.locked ? 'lock' : 'unlock'} size={16} /> {note.locked ? 'Locked' : 'Lock'}
        </button>
      </div>

      <div className="side-setting side-setting--border">
        <strong>Colour</strong>
        <NoteColorPicker noteId={note.id} color={note.color} />
      </div>

      <div className="side-setting side-setting--border">
        <button
          type="button"
          className="danger-option"
          onClick={onDelete}
          disabled={note.locked}
          data-tooltip={note.locked ? 'Unlock the canvas to delete it.' : undefined}
          data-tooltip-align="start"
        >
          <Icon name="trash" size={16} /> Delete canvas
        </button>
      </div>
    </section>
  );
}
