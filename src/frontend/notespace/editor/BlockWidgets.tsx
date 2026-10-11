import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { categoryName, getNote, updatedLabel, useNotes } from '../store';
import { hydratePages, lineBelowTable, type PageSize } from './blocks';
import { placeCaret } from './dom';
import type { EditorSession } from './session';

type BlockWidgetsProps = {
  session: EditorSession;
  locked: boolean;
  onOpenNote: (id: string) => void;
};

type Preview = { id: string; top: number; left: number; above: boolean };


/* =========================
   Block Widgets
   ========================= */

/* The parts of page blocks, page links, toggle lists and tables that need more than typing: */
/* opening pages, block sizes, link previews, the toggle arrow and the line under a table. */
/* Table grips and menus are in TableTools. */
export function BlockWidgets({ session, locked, onOpenNote }: BlockWidgetsProps) {
  const notes = useNotes();
  const [preview, setPreview] = useState<Preview | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const latest = useRef({ locked, onOpenNote });
  latest.current = { locked, onOpenNote };

  /* Page blocks show the current title and description of the page they point to. */
  useEffect(() => {
    hydratePages(document.getElementById('note-body'));
  }, [notes]);

  useEffect(() => {
    const body = () => document.getElementById('note-body');

    function handleClick(event: MouseEvent) {
      const target = event.target as Element;
      if (!body()?.contains(target)) return;
      const { locked: isLocked, onOpenNote: open } = latest.current;
      const block = target.closest<HTMLElement>('.page-block');
      const sizeButton = target.closest<HTMLElement>('[data-size-option]');

      /* S / M / L buttons change how much of the page the block shows. */
      if (block && sizeButton) {
        event.preventDefault();
        if (isLocked) return;
        session.checkpoint();
        block.dataset.size = sizeButton.dataset.sizeOption as PageSize;
        hydratePages(block.parentElement);
        session.commit();
        return;
      }

      /* A page block opens its page with a normal click. */
      if (block) {
        event.preventDefault();
        if (getNote(block.dataset.page ?? '')) open(block.dataset.page as string);
        return;
      }

      /* A page link is text, so it opens with Ctrl + click (or a normal click on a locked note). */
      const link = target.closest<HTMLElement>('a.page-link');
      if (link && (isLocked || event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        if (getNote(link.dataset.page ?? '')) open(link.dataset.page as string);
        return;
      }

      /* The arrow sits in the left padding of a toggle's title; clicking it opens or closes the toggle. */
      const summary = target.closest<HTMLElement>('.toggle-summary');
      const style = summary ? getComputedStyle(summary) : null;
      if (summary && style && event.clientX < summary.getBoundingClientRect().left + parseFloat(style.paddingLeft)) {
        event.preventDefault();
        const toggle = summary.closest('.toggle-block');
        if (!isLocked) session.checkpoint();
        toggle?.classList.toggle('is-open');
        if (!isLocked) session.commit();
      }
    }

    /* Clicking just under a table puts the caret on the line below it, adding that line when */
    /* the table is the last thing in the note or is followed by another block. */
    function handleMouseDown(event: MouseEvent) {
      const note = body();
      const target = event.target as Element;
      if (!note?.contains(target) || latest.current.locked || event.button !== 0 || target.closest('table')) return;
      const table = Array.from(note.querySelectorAll('table')).find(item => {
        const bounds = item.getBoundingClientRect();
        return event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY > bounds.bottom && event.clientY <= bounds.bottom + 24;
      });
      if (!table) return;
      event.preventDefault();
      note.focus({ preventScroll: true });
      const { line, created } = lineBelowTable(table);
      if (!created) {
        placeCaret(line);
        return;
      }
      session.checkpoint();
      session.linesChanged(line, false);
    }

    /* Hovering a page link shows a preview of that page under it. */
    function handleMouseOver(event: MouseEvent) {
      const target = event.target as Element;
      const link = target.closest?.<HTMLElement>('a.page-link');
      if (target.closest?.('.page-preview')) {
        window.clearTimeout(hideTimer.current);
        return;
      }
      if (!link || !body()?.contains(link)) return;
      window.clearTimeout(hideTimer.current);

      /* The preview opens under the link, or above it near the bottom of the window. */
      const bounds = link.getBoundingClientRect();
      const above = bounds.bottom + 240 > window.innerHeight && bounds.top > 240;
      setPreview({ id: link.dataset.page ?? '', top: above ? bounds.top - 6 : bounds.bottom + 6, left: Math.min(bounds.left, window.innerWidth - 320), above });
    }

    function handleMouseOut(event: MouseEvent) {
      const target = event.target as Element;
      if (!target.closest?.('a.page-link, .page-preview')) return;
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setPreview(null), 200);
    }

    document.addEventListener('click', handleClick);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      window.clearTimeout(hideTimer.current);
    };
  }, [session]);

  const note = preview ? getNote(preview.id) : undefined;
  const category = note ? categoryName(note.category) : '';

  return (
    <>
      {preview && (
        <div className="page-preview" style={{ top: preview.top, left: preview.left, transform: preview.above ? 'translateY(-100%)' : undefined }} role="tooltip">
          {note ? (
            <>
              <span className="page-preview-title">
                {note.icon ? <span aria-hidden="true">{note.icon}</span> : <Icon name="file-text" size={16} />}
                <strong>{note.title || 'Untitled note'}</strong>
              </span>
              <span className="page-preview-meta">{category && `${category} · `}{updatedLabel(note)}</span>
              <span className="page-preview-text">{note.subtitle || note.preview || 'This page is empty.'}</span>
              <span className="page-preview-footer">
                <span>{locked ? 'Click to open' : 'Ctrl + click to open'}</span>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => onOpenNote(note.id)}>
                  Open <Icon name="arrow-right" size={13} />
                </button>
              </span>
            </>
          ) : <span className="page-preview-text">This page was deleted.</span>}
        </div>
      )}
    </>
  );
}
