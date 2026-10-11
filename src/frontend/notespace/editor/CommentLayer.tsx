import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { Icon } from '../../components/Icon';
import type { NoteComment } from '../../../shared/types/note';
import { getNote } from '../store';
import { pageIdFromAddress, textWithAddresses } from './links';
import { useSessionValue, type EditorSession } from './session';

type Marker = {
  comment: NoteComment;
  top: number;
};

/* A comment's text, with web addresses shown as links and page addresses as links to their page. */
/* Hovering them shows the same preview as links in the note (see LinkTools). */
function CommentText({ text }: { text: string }) {
  return (
    <>
      {textWithAddresses(text).map((part, index) => {
        if (!('href' in part)) return part.text;
        const page = pageIdFromAddress(part.text);
        const note = page ? getNote(page) : undefined;
        if (page && note) return <a key={index} className="page-link" data-page={page}>{note.title || 'Untitled note'}</a>;
        return <a key={index} href={part.href} target="_blank" rel="noopener noreferrer">{part.text}</a>;
      })}
    </>
  );
}

type CommentLayerProps = {
  session: EditorSession;
  comments: NoteComment[];
  containerRef: RefObject<HTMLDivElement | null>;
};


/* =========================
   Comment Markers
   ========================= */

/* A small speech-bubble marker sits beside each commented line; clicking it shows the comment. */
/* Markers are positioned inside the zoomed note, so measurements are divided by the zoom scale. */
export function CommentLayer({ session, comments, containerRef }: CommentLayerProps) {
  const layout = useSessionValue(session, snapshot => snapshot.layout);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const base = container.getBoundingClientRect();
    const scale = base.width / (container.offsetWidth || 1);
    let lastTop = -Infinity;

    const next: Marker[] = [];
    comments.forEach(comment => {
      const mark = container.querySelector(`[data-comment="${comment.id}"]`);
      if (!mark) return;

      /* Markers on the same line are stacked so they do not cover each other. */
      let top = (mark.getBoundingClientRect().top - base.top) / scale;
      if (top - lastTop < 24) top = lastTop + 24;
      lastTop = top;
      next.push({ comment, top });
    });
    next.sort((a, b) => a.top - b.top);
    setMarkers(current => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
  }, [layout, comments, containerRef]);

  /* Clicking commented text opens its comment too. */
  useEffect(() => {
    const container = containerRef.current;
    function handleClick(event: MouseEvent) {
      const mark = (event.target as Element).closest?.('.comment-mark');
      if (mark instanceof HTMLElement && mark.dataset.comment) setOpenId(mark.dataset.comment);
    }
    container?.addEventListener('click', handleClick);
    return () => container?.removeEventListener('click', handleClick);
  }, [containerRef]);

  /* Clicking anywhere else closes the open comment. */
  useEffect(() => {
    if (!openId) return;
    function handleMouseDown(event: MouseEvent) {
      const target = event.target as Element;
      if (!target.closest?.('.comment-marker-wrap, .comment-mark')) setOpenId(null);
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [openId]);

  /* Highlight the text of the open comment. */
  useEffect(() => {
    const container = containerRef.current;
    container?.querySelectorAll('.comment-mark').forEach(mark => {
      mark.classList.toggle('is-active', (mark as HTMLElement).dataset.comment === openId);
    });
  }, [openId, layout, containerRef]);

  return (
    <div className="comment-layer">
      {markers.map(({ comment, top }) => (
        <div key={comment.id} className="comment-marker-wrap" style={{ top }}>
          <button
            type="button"
            className={`comment-marker ${openId === comment.id ? 'is-open' : ''}`}
            aria-label="Show comment"
            aria-expanded={openId === comment.id}
            onClick={() => setOpenId(current => (current === comment.id ? null : comment.id))}
          >
            <Icon name="message-square" size={14} />
          </button>
          {openId === comment.id && (
            <div className="comment-popover" role="dialog" aria-label="Comment">
              <p><CommentText text={comment.text} /></p>
              <div className="comment-popover-footer">
                <span>{comment.createdAt ? new Date(comment.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</span>
                <button type="button" className="comment-delete" onClick={() => { session.removeComment(comment.id); setOpenId(null); }}>
                  <Icon name="trash" size={13} /> Delete
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
