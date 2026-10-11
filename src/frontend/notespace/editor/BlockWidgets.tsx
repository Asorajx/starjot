import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Icon } from '../../components/Icon';
import { categoryName, childrenOf, deleteNote, getNote, separatePage, updatedLabel, useNotes } from '../store';
import {
  deleteKeepingPages, hydratePages, lineBelowTable, pageBlockIsCut, pageBlocksIn, removePageBlocks, setPageWidth, stepOverPage, type PageSize
} from './blocks';
import { placeCaret } from './dom';
import type { EditorSession } from './session';

type BlockWidgetsProps = {
  session: EditorSession;
  locked: boolean;
  onOpenNote: (id: string) => void;
};

/* block: the preview is for a page block (opened with a click) rather than a page link (Ctrl + click). */
type Preview = { id: string; top: number; left: number; above: boolean; block: boolean };

/* The menu opened by right-clicking a page block, at the pointer. */
type PageMenu = { id: string; top: number; left: number };


/* =========================
   Block Widgets
   ========================= */

/* The parts of page blocks, page links, toggle lists and tables that need more than typing: */
/* opening pages, block sizes, link previews, the toggle arrow and the line under a table. */
/* Table grips and menus are in TableTools. */
export function BlockWidgets({ session, locked, onOpenNote }: BlockWidgetsProps) {
  const notes = useNotes();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pageMenu, setPageMenu] = useState<PageMenu | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);

  /* The page block whose width is being dragged. */
  const resizing = useRef<HTMLElement | null>(null);
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
      if (target.closest('.page-block-resize')) {
        event.preventDefault();
        return;
      }
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

    /* Dragging the right edge of a page block makes it narrower or wider. */
    function handlePointerDown(event: PointerEvent) {
      const handle = (event.target as Element).closest?.('.page-block-resize');
      const block = handle?.closest<HTMLElement>('.page-block');
      if (!block || latest.current.locked || event.button !== 0) return;
      event.preventDefault();
      session.checkpoint();
      resizing.current = block;
      block.classList.add('is-resizing');
      setPreview(null);
    }

    function handlePointerMove(event: PointerEvent) {
      const block = resizing.current;
      const line = block?.parentElement;
      if (!block || !line) return;

      /* The width is measured against the whole line, so 100% fills it. */
      const bounds = block.getBoundingClientRect();
      setPageWidth(block, ((event.clientX - bounds.left) / line.getBoundingClientRect().width) * 100);
    }

    function handlePointerUp() {
      const block = resizing.current;
      if (!block) return;
      resizing.current = null;
      block.classList.remove('is-resizing');
      session.commit();
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

    /* Hovering a page link shows a preview of that page under it. A page block shows the same */
    /* preview, but only when part of its title or description is hidden by its size or width. */
    function handleMouseOver(event: MouseEvent) {
      const target = event.target as Element;
      if (target.closest?.('.page-preview')) {
        window.clearTimeout(hideTimer.current);
        return;
      }
      const link = target.closest?.<HTMLElement>('a.page-link');
      const block = target.closest?.<HTMLElement>('.page-block');

      /* Pages listed in the note's details always show their preview. */
      const listed = target.closest?.<HTMLElement>('[data-preview-page]');
      const inNote = link ?? (block && !resizing.current && !target.closest('.page-block-sizes, .page-block-resize') && pageBlockIsCut(block) ? block : null);
      const anchor = listed ?? (inNote && body()?.contains(inNote) ? inNote : null);
      if (!anchor) return;
      window.clearTimeout(hideTimer.current);

      /* The preview opens under the link or block, or above it near the bottom of the window. */
      const bounds = anchor.getBoundingClientRect();
      const above = bounds.bottom + 240 > window.innerHeight && bounds.top > 240;
      setPreview({
        id: anchor.dataset.page ?? anchor.dataset.previewPage ?? '',
        top: above ? bounds.top - 6 : bounds.bottom + 6,
        left: Math.min(bounds.left, window.innerWidth - 320),
        above,
        block: anchor !== link
      });
    }

    function handleMouseOut(event: MouseEvent) {
      const target = event.target as Element;
      if (!target.closest?.('a.page-link, .page-block, .page-preview, [data-preview-page]')) return;
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setPreview(null), 200);
    }

    /* Typing never deletes a page block. Backspace or Delete next to one steps over it, and */
    /* deleting a selection inside one line keeps the blocks in it. (Selections across blocks in */
    /* structured mode are handled by that editor, which keeps them too.) */
    function handleBeforeInput(event: InputEvent) {
      const note = body();
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      if (!note || !range || latest.current.locked || !note.contains(range.commonAncestorContainer)) return;
      if (stepOverPage(event, note)) {
        event.preventDefault();
        return;
      }

      const replaces = event.inputType.startsWith('delete') || event.inputType === 'insertText' || event.inputType === 'insertReplacementText';
      const blockOf = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest('.block-content');
      if (!replaces || range.collapsed || blockOf(range.startContainer) !== blockOf(range.endContainer) || !pageBlocksIn(range, note).length) return;
      event.preventDefault();
      session.checkpoint();
      deleteKeepingPages(range, note, event.inputType === 'insertText' ? event.data ?? '' : '');
      session.commit();
    }

    /* Right-clicking a page block opens its menu instead of the browser's. */
    function handleContextMenu(event: MouseEvent) {
      const block = (event.target as Element).closest?.<HTMLElement>('.page-block');
      if (!block || !body()?.contains(block) || !block.dataset.page) return;
      event.preventDefault();
      setPreview(null);
      setPageMenu({ id: block.dataset.page, top: event.clientY, left: event.clientX });
    }

    function closeMenu(event: Event) {
      if (!(event.target as Element).closest?.('.page-menu')) setPageMenu(null);
    }

    document.addEventListener('beforeinput', handleBeforeInput, true);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('mousedown', closeMenu);
    document.getElementById('main-scroll')?.addEventListener('scroll', closeMenu);
    document.addEventListener('click', handleClick);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    return () => {
      document.removeEventListener('beforeinput', handleBeforeInput, true);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('mousedown', closeMenu);
      document.getElementById('main-scroll')?.removeEventListener('scroll', closeMenu);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      window.clearTimeout(hideTimer.current);
    };
  }, [session]);

  /* Take a page's blocks out of this note's text (one undo step), then delete or move the page. */
  function removeFromText(id: string) {
    const note = document.getElementById('note-body');
    if (!note) return;
    session.checkpoint();
    removePageBlocks(note, id);
    session.commit();
  }

  function separate(id: string) {
    setPageMenu(null);
    removeFromText(id);
    separatePage(id);
  }

  function confirmDelete() {
    if (!deleting) return;
    removeFromText(deleting);
    deleteNote(deleting);
    setDeleting(null);
  }

  const note = preview ? getNote(preview.id) : undefined;
  const category = note ? categoryName(note.category) : '';
  const menuNote = pageMenu ? getNote(pageMenu.id) : undefined;
  const deletingNote = deleting ? getNote(deleting) : undefined;
  const nested = deleting ? childrenOf(deleting).length : 0;

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
                <span>{locked || preview.block ? 'Click to open' : 'Ctrl + click to open'}</span>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => onOpenNote(note.id)}>
                  Open <Icon name="arrow-right" size={13} />
                </button>
              </span>
            </>
          ) : <span className="page-preview-text">This page was deleted.</span>}
        </div>
      )}

      {/* Separate page moves it out of this note (up one level); Delete removes it for good, after asking. */}
      {pageMenu && (
        <div
          className="page-menu"
          role="menu"
          aria-label="Page options"
          style={{ top: Math.min(pageMenu.top, window.innerHeight - 140), left: Math.min(pageMenu.left, window.innerWidth - 220) }}
          onKeyDown={event => {
            if (event.key === 'Escape') setPageMenu(null);
          }}
        >
          <button type="button" role="menuitem" className="page-menu-item" disabled={!menuNote} onClick={() => { setPageMenu(null); onOpenNote(pageMenu.id); }}>
            <Icon name="arrow-right" size={14} /> Open page
          </button>
          {!locked && (
            <>
              <button type="button" role="menuitem" className="page-menu-item" disabled={!menuNote} onClick={() => separate(pageMenu.id)}>
                <Icon name="arrow-up" size={14} /> Separate page
              </button>
              <button
                type="button"
                role="menuitem"
                className="page-menu-item is-danger"
                onClick={() => {
                  setPageMenu(null);
                  if (menuNote) setDeleting(pageMenu.id);
                  else removeFromText(pageMenu.id);
                }}
              >
                <Icon name="trash" size={14} /> {menuNote ? 'Delete sub-page' : 'Remove from page'}
              </button>
            </>
          )}
        </div>
      )}

      {deleting && (
        <ConfirmDialog title="Delete this sub-page?" confirmLabel="Delete sub-page" danger onConfirm={confirmDelete} onCancel={() => setDeleting(null)}>
          <p><strong>{deletingNote?.title || 'Untitled note'}</strong> and everything written in it will be removed from this browser. This cannot be undone.</p>
          {nested > 0 && <p>Its {nested} sub-page(s) will be kept and move into this note.</p>}
        </ConfirmDialog>
      )}
    </>
  );
}
