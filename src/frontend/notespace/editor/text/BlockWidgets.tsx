import { useEffect, useRef, useState } from 'react';
import { DeleteNoteDialog } from '../../DeleteNoteDialog';
import { Icon } from '../../../components/Icon';
import { deleteNote, getNote, separatePage, useNotes } from '../../store';
import { deleteKeepingPages, hydratePages, pageBlocksIn, removePageBlocks, setPageWidth, stepOverPage, type PageSize } from './pageBlocks';
import { lineBelowTable, typeOutsideComment } from './blockKeys';
import { placeCaret } from './dom';
import { LinkPreviewCard } from '../links/LinkPreview';
import { copyPageLink } from '../links/links';
import type { EditorSession } from '../session';

type BlockWidgetsProps = {
  session: EditorSession;
  locked: boolean;
  onOpenNote: (id: string) => void;
};

/* A preview of a page, shown for a page block or a page listed in the note's details. */
type Preview = { id: string; top: number; left: number; above: boolean };

/* The menu opened by right-clicking a page block, or a page listed in the note's details, at the pointer. */
type PageMenu = { id: string; top: number; left: number };


/* =========================
   Block Widgets
   ========================= */

/* The parts of page blocks, page links, toggle lists and tables that need more than typing: */
/* opening pages, block sizes, page previews, the toggle arrow and the line under a table. */
/* Table grips and menus are in TableTools; links (page links included) are in LinkTools. */
export function BlockWidgets({ session, locked, onOpenNote }: BlockWidgetsProps) {
  const notes = useNotes();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pageMenu, setPageMenu] = useState<PageMenu | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const showTimer = useRef<number | undefined>(undefined);

  /* The page block whose width is being dragged. */
  const resizing = useRef<HTMLElement | null>(null);
  const latest = useRef({ locked, onOpenNote, previewId: preview?.id ?? null });
  latest.current = { locked, onOpenNote, previewId: preview?.id ?? null };

  /* Page blocks show the current title and description of the page they point to. */
  useEffect(() => {
    hydratePages(session.body());
  }, [notes]);

  useEffect(() => {
    const body = () => session.body();
    const scroller = session.scroller();

    function handleClick(event: MouseEvent) {
      const target = event.target as Element;
      if (!body()?.contains(target)) return;
      const { locked: isLocked, onOpenNote: open } = latest.current;
      const block = target.closest<HTMLElement>('.page-block, .page-mention');
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

      /* A page block or a page mention opens its page with a normal click. */
      if (block) {
        event.preventDefault();
        if (getNote(block.dataset.page ?? '')) open(block.dataset.page as string);
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

    /* Hovering a page block shows a preview of its page, but only when part of its title or */
    /* description is hidden by its size or width. */
    function handleMouseOver(event: MouseEvent) {
      const target = event.target as Element;
      if (target.closest?.('.page-preview')) {
        window.clearTimeout(hideTimer.current);
        return;
      }
      const block = target.closest?.<HTMLElement>('.page-block, .page-mention');

      /* Pages listed in the note's details show the preview too. The size buttons and the width */
      /* handle are left alone, so they are easy to use. */
      const listed = target.closest?.<HTMLElement>('[data-preview-page]');
      const inNote = block && !resizing.current && !target.closest('.page-block-sizes, .page-block-resize') ? block : null;
      const anchor = listed ?? (inNote && body()?.contains(inNote) ? inNote : null);
      if (!anchor) return;
      window.clearTimeout(hideTimer.current);

      /* Already showing this page: the pointer only moved within it. */
      const id = anchor.dataset.page ?? anchor.dataset.previewPage ?? '';
      if (latest.current.previewId === id) return;
      window.clearTimeout(showTimer.current);

      /* After a short pause, so moving the pointer across the page does not flash previews, the */
      /* preview opens under the page, or above it near the bottom of the window. */
      showTimer.current = window.setTimeout(() => {
        if (!anchor.isConnected) return;
        const bounds = anchor.getBoundingClientRect();
        const above = bounds.bottom + 200 > window.innerHeight && bounds.top > 200;
        setPreview({
          id,
          top: above ? bounds.top - 6 : bounds.bottom + 6,
          left: Math.min(bounds.left, window.innerWidth - 320),
          above
        });
      }, 250);
    }

    function handleMouseOut(event: MouseEvent) {
      const target = event.target as Element;
      if (!target.closest?.('.page-block, .page-mention, .page-preview, [data-preview-page]')) return;

      /* Moving between a page and its preview (or within either) keeps the preview. */
      const next = event.relatedTarget as Element | null;
      if (next?.closest?.('.page-block, .page-mention, .page-preview, [data-preview-page]')) return;
      window.clearTimeout(showTimer.current);
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setPreview(null), 200);
    }

    /* Typing never deletes a page block. Backspace or Delete next to one steps over it, and */
    /* deleting a selection inside one line keeps the blocks in it. (Selections across blocks in */
    /* structured mode are handled by that editor, which keeps them too.) Text typed at the edge */
    /* of a comment goes outside it. */
    function handleBeforeInput(event: InputEvent) {
      const note = body();
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      if (!note || !range || latest.current.locked || !note.contains(range.commonAncestorContainer)) return;
      if (stepOverPage(event, note)) {
        event.preventDefault();
        return;
      }
      if (typeOutsideComment(event)) {
        event.preventDefault();
        session.commit();
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

    /* Right-clicking a page block, or a page listed in this note's details, opens the page menu */
    /* instead of the browser's. */
    function handleContextMenu(event: MouseEvent) {
      const target = event.target as Element;
      const block = target.closest?.<HTMLElement>('.page-block');
      const listed = target.closest?.<HTMLElement>('[data-preview-page]');
      const inThisNote = listed && body()?.closest('.editor-wrap')?.contains(listed);
      const id = block && body()?.contains(block) ? block.dataset.page : inThisNote ? listed.dataset.previewPage : undefined;
      if (!id) return;
      event.preventDefault();
      window.clearTimeout(showTimer.current);
      setPreview(null);
      setPageMenu({ id, top: event.clientY, left: event.clientX });
    }

    function closeMenu(event: Event) {
      if (!(event.target as Element).closest?.('.page-menu')) setPageMenu(null);
    }

    document.addEventListener('beforeinput', handleBeforeInput, true);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('mousedown', closeMenu);
    scroller?.addEventListener('scroll', closeMenu);
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
      scroller?.removeEventListener('scroll', closeMenu);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      window.clearTimeout(hideTimer.current);
      window.clearTimeout(showTimer.current);
    };
  }, [session]);

  /* Take a page's blocks out of this note's text (one undo step), then delete or move the page. */
  function removeFromText(id: string) {
    const note = session.body();
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

  function confirmDelete(withSubNotes: boolean) {
    if (!deleting) return;
    removeFromText(deleting);
    deleteNote(deleting, withSubNotes);
    setDeleting(null);
  }

  const menuNote = pageMenu ? getNote(pageMenu.id) : undefined;

  return (
    <>
      {preview && (
        <div className="page-preview" style={{ top: preview.top, left: preview.left, transform: preview.above ? 'translateY(-100%)' : undefined }} role="tooltip">
          <LinkPreviewCard target={{ kind: 'page', id: preview.id }} />
        </div>
      )}

      {/* Copy link copies the page's address. Separate page moves it out of this note (up one level); */}
      {/* Delete removes it for good, after asking. */}
      {pageMenu && (
        <div
          className="page-menu"
          role="menu"
          aria-label="Sub-note options"
          style={{ top: Math.min(pageMenu.top, window.innerHeight - 140), left: Math.min(pageMenu.left, window.innerWidth - 220) }}
          onKeyDown={event => {
            if (event.key === 'Escape') setPageMenu(null);
          }}
        >
          <button type="button" role="menuitem" className="page-menu-item" disabled={!menuNote} onClick={() => { setPageMenu(null); onOpenNote(pageMenu.id); }}>
            <Icon name="arrow-right" size={14} /> Open note
          </button>
          <button type="button" role="menuitem" className="page-menu-item" disabled={!menuNote} onClick={() => { setPageMenu(null); copyPageLink(pageMenu.id).catch(() => undefined); }}>
            <Icon name="copy" size={14} /> Copy link
          </button>
          {!locked && (
            <>
              <button type="button" role="menuitem" className="page-menu-item" disabled={!menuNote} onClick={() => separate(pageMenu.id)}>
                <Icon name="arrow-up" size={14} /> Separate note
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
                <Icon name="trash" size={14} /> {menuNote ? 'Delete sub-note' : 'Remove from note'}
              </button>
            </>
          )}
        </div>
      )}

      {deleting && <DeleteNoteDialog noteId={deleting} sub onConfirm={confirmDelete} onCancel={() => setDeleting(null)} />}
    </>
  );
}
