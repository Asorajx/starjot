import { useLayoutEffect, useRef } from 'react';
import { cleanHtml } from '../sanitize';
import { ContinuousEditor } from '../editor/text/ContinuousEditor';
import { hydratePages } from '../editor/text/pageBlocks';
import { hydrateTables } from '../editor/tables/tables';
import { highlightAll } from '../editor/code/code';
import { placeCaret } from '../editor/text/dom';
import type { EditorSession } from '../editor/session';
import type { CanvasBox } from './boxes';


/* =========================
   Canvas Text Boxes
   ========================= */

/* The box being written in: where it is (a new box is not in the content until something is */
/* typed), and the point on screen that was clicked, for the caret. */
export type EditingBox = { id: string; x: number; y: number; width: number; caretAt: { x: number; y: number } | null };

/* A box being moved or widened with Select, shown where it would be dropped. */
export type BoxDrag = { id: string; dx: number; dy: number; width: number };

type CanvasBoxesProps = {
  boxes: CanvasBox[];
  editing: EditingBox | null;
  selected: string | null;
  drag: BoxDrag | null;
  session: EditorSession;

  /* Changes after undo and redo, so the box being written in shows the restored words. */
  revision: number;
};

/* The canvas's text boxes, in the canvas's moving and zooming space. They read as plain words: */
/* a selected box gets an outline and a handle to widen it, and the box being written in holds */
/* the note editor (so slash commands, note links and formatting all work), saving into its own */
/* box through the session's frame. */
export function CanvasBoxes({ boxes, editing, selected, drag, session, revision }: CanvasBoxesProps) {
  const holderRef = useRef<HTMLDivElement>(null);
  const shown = editing && !boxes.some(box => box.id === editing.id) ? [...boxes, { ...editing, html: '' }] : boxes;

  /* Note cards, links, pictures, tables, code colours and reminders are drawn when shown. */
  useLayoutEffect(() => {
    holderRef.current?.querySelectorAll('.canvas-box-text').forEach(text => {
      hydratePages(text);
      hydrateTables(text);
      highlightAll(text);
    });
  });

  /* Writing starts with the caret where the box was clicked, or at the end of its words. This */
  /* runs only when another box starts being written in, not after each saved key press. */
  const editingId = editing?.id ?? null;
  useLayoutEffect(() => {
    const body = session.body();
    if (!editingId || !body) return;
    body.focus({ preventScroll: true });
    const point = editing?.caretAt;
    const range = point ? document.caretRangeFromPoint?.(point.x, point.y) : null;
    if (range && body.contains(range.startContainer)) {
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    } else if (body.lastElementChild instanceof HTMLElement) {
      placeCaret(body.lastElementChild, true);
    }
  }, [editingId, session]);

  return (
    <div ref={holderRef} className="canvas-boxes">
      {shown.map(box => {
        const moved = drag?.id === box.id ? drag : null;
        const style = { left: box.x + (moved?.dx ?? 0), top: box.y + (moved?.dy ?? 0), width: moved?.width ?? box.width };
        if (box.id === editingId) {
          return (
            <div key={box.id} className="canvas-box is-editing" data-box={box.id} style={style}>
              <ContinuousEditor key={`${box.id}-${revision}`} session={session} content={box.html} locked={false} />
            </div>
          );
        }
        return (
          <div key={box.id} className={`canvas-box ${selected === box.id ? 'is-selected' : ''}`} data-box={box.id} style={style}>
            <div className="note-body article-body continuous-document canvas-box-text" dangerouslySetInnerHTML={{ __html: cleanHtml(box.html) }} />
            {selected === box.id && <span className="canvas-box-resize" data-box-resize="" aria-hidden="true" />}
          </div>
        );
      })}
    </div>
  );
}
