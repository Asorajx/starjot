import { useEffect, useRef, useState } from 'react';
import { useEscape } from '../../lib/useDismiss';
import { useFocusTrap } from '../../lib/useFocusTrap';
import { Choice, Row } from '../export/ExportDialog';
import type { Note } from '../../../shared/types/note';
import type { CanvasBox } from './boxes';
import {
  CANVAS_EXPORT_FORMATS, exportCanvasMarkdown, exportCanvasPdf, exportCanvasPng, exportCanvasText, type CanvasExportFormat, type PlacedBox
} from './exportCanvas';


/* =========================
   Canvas Export Window
   ========================= */

type CanvasExportDialogProps = {
  note: Note;
  boxes: CanvasBox[];

  /* The text boxes as laid out on screen, for a picture or a PDF. */
  measure: () => PlacedBox[];
  onClose: () => void;
};

/* The format chosen last, while Starjot is open. */
let lastFormat: CanvasExportFormat = 'png';

/* The Export window for a canvas, opened from Canvas settings. A picture or PDF shows everything */
/* on the canvas (cropped to it); Markdown and plain text hold the words of its text boxes, top to */
/* bottom. An empty canvas has nothing to export. */
export function CanvasExportDialog({ note, boxes, measure, onClose }: CanvasExportDialogProps) {
  const [format, setFormat] = useState(lastFormat);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const exportRef = useRef<HTMLButtonElement>(null);
  const picture = format === 'png' || format === 'pdf';
  const empty = picture ? !boxes.length && !note.drawing.length : !boxes.length;

  useEffect(() => exportRef.current?.focus(), []);
  useEscape(true, onClose);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, null);

  function choose(next: CanvasExportFormat) {
    lastFormat = next;
    setFormat(next);
  }

  async function run() {
    setBusy(true);
    setFailed(false);
    try {
      if (format === 'png') await exportCanvasPng(note, measure());
      else if (format === 'pdf') await exportCanvasPdf(note, measure());
      else if (format === 'markdown') exportCanvasMarkdown(note, boxes);
      else exportCanvasText(note, boxes);
      onClose();
    } catch (error) {
      console.warn('Notespace: the export failed.', error);
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="dialog export-dialog" role="dialog" aria-modal="true" aria-label="Export canvas">
        <Row label="Export format">
          <Choice label="Export format" value={format} options={CANVAS_EXPORT_FORMATS} onChange={choose} />
        </Row>
        {empty && <p className="export-note">{picture ? 'This canvas is empty.' : 'This canvas has no text boxes.'}</p>}
        {failed && <p className="export-error">The export did not work. Please try again.</p>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
          <button ref={exportRef} type="button" className="btn btn-primary" disabled={busy || empty} onClick={run}>{busy ? 'Exporting…' : 'Export'}</button>
        </div>
      </div>
    </div>
  );
}
