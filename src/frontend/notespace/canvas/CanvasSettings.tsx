import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Switch } from '../../components/Switch';
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

  /* Opens the Export window. */
  onExport: () => void;
  onDelete: () => void;
};

/* The settings of a canvas: the same panel as a document's Note settings, with only what a */
/* canvas has (no structure, layout or text size). */
export function CanvasSettings({ id, note, open, onClose, onExport, onDelete }: CanvasSettingsProps) {
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

      <div className="option-grid is-three">
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
          className="option-tile"
          data-tooltip="Save this canvas as a picture (PNG) or PDF, or its text boxes' words as Markdown or plain text."
          data-tooltip-wrap=""
          onClick={onExport}
        >
          <Icon name="download" size={16} /> Export
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
        <strong>Background</strong>
        <label className="note-switch-row" data-tooltip="Dots that move and grow with the canvas, to show where you are. Off leaves the background plain." data-tooltip-align="start" data-tooltip-wrap="">
          <span>Show dots</span>
          <Switch label="Show dots" on={!note.dotsHidden} onChange={shown => updateNote(note.id, { dotsHidden: !shown })} />
        </label>
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
