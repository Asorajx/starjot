import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Icon } from '../../components/Icon';
import { categoryName, getNote, updatedLabel, useNotes } from '../store';
import { addColumn, addRow, hydratePages, lineBelowTable, removeColumn, removeRow, type PageSize } from './blocks';
import { emptyParagraph, placeCaret } from './dom';
import type { EditorSession } from './session';

type BlockWidgetsProps = {
  session: EditorSession;
  locked: boolean;
  onOpenNote: (id: string) => void;
};

type Preview = { id: string; top: number; left: number; above: boolean };
type TableBar = { top: number; right: number };
type TableAction = 'row' | 'column' | 'remove-row' | 'remove-column';

const TABLE_ACTIONS: { action: TableAction; label: string }[] = [
  { action: 'row', label: 'Add row' },
  { action: 'column', label: 'Add column' },
  { action: 'remove-row', label: 'Delete row' },
  { action: 'remove-column', label: 'Delete column' }
];


/* =========================
   Block Widgets
   ========================= */

/* The parts of page blocks, page links, toggle lists and tables that need more than typing: */
/* opening pages, block sizes, link previews, the toggle arrow and the table buttons. */
export function BlockWidgets({ session, locked, onOpenNote }: BlockWidgetsProps) {
  const notes = useNotes();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [tableBar, setTableBar] = useState<TableBar | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);

  /* The table cell holding the caret, which the table buttons act on. */
  const cell = useRef<HTMLTableCellElement | null>(null);
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

    /* The table buttons appear above the table's right corner while the caret is in one of its cells, */
    /* leaving the space under the table free for clicking to add a line. */
    function updateTableBar() {
      const node = window.getSelection()?.focusNode;
      const element = node instanceof Element ? node : node?.parentElement;
      const current = element?.closest<HTMLTableCellElement>('td, th') ?? null;
      if (!current || latest.current.locked || !body()?.contains(current)) {
        cell.current = null;
        setTableBar(null);
        return;
      }
      cell.current = current;
      const bounds = (current.closest('table') as HTMLElement).getBoundingClientRect();
      setTableBar({ top: bounds.top - 36, right: window.innerWidth - bounds.right });
    }

    const scroller = document.getElementById('main-scroll');
    document.addEventListener('click', handleClick);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('selectionchange', updateTableBar);
    scroller?.addEventListener('scroll', updateTableBar);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      document.removeEventListener('selectionchange', updateTableBar);
      scroller?.removeEventListener('scroll', updateTableBar);
      window.clearTimeout(hideTimer.current);
    };
  }, [session]);

  /* Add or delete a row or column next to the caret's cell. Deleting the last one removes the table. */
  function runTableAction(action: TableAction) {
    const current = cell.current;
    const table = current?.closest('table');
    const row = current?.parentElement as HTMLTableRowElement | undefined;
    if (!current?.isConnected || !table || !row) return;
    const column = current.cellIndex;
    session.checkpoint();

    let next: HTMLTableCellElement | null | undefined = current;
    let remaining = true;
    if (action === 'row') next = addRow(table, row).cells[column];
    else if (action === 'column') {
      addColumn(table, column);
      next = row.cells[column + 1];
    } else if (action === 'remove-row') {
      const index = row.rowIndex;
      remaining = removeRow(table, row);
      next = table.rows[Math.min(index, table.rows.length - 1)]?.cells[column];
    } else {
      remaining = removeColumn(table, column);
      next = row.cells[Math.min(column, row.cells.length - 1)];
    }

    if (!remaining) {
      const paragraph = emptyParagraph();
      table.replaceWith(paragraph);
      session.linesChanged(paragraph, false);
      return;
    }
    if (next) placeCaret(next, true);
    session.commit();
  }

  const note = preview ? getNote(preview.id) : undefined;
  const category = note ? categoryName(note.category) : '';

  /* Keep the caret in the table while a button is pressed. */
  const keepFocus = (event: ReactMouseEvent) => event.preventDefault();

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

      {tableBar && (
        <div className="table-bar" style={{ top: tableBar.top, right: tableBar.right }} role="toolbar" aria-label="Table">
          {TABLE_ACTIONS.map(item => (
            <button key={item.action} type="button" className="table-bar-button" onMouseDown={keepFocus} onClick={() => runTableAction(item.action)}>
              {item.action === 'row' || item.action === 'column' ? <Icon name="plus" size={13} /> : <Icon name="minus" size={13} />} {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
