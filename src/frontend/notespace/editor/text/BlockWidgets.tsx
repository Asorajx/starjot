import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DeleteNoteDialog } from '../../DeleteNoteDialog';
import { Icon } from '../../../components/Icon';
import { opensNewTab, type OpenById } from '../../../lib/clicks';
import { getNote, noteTitle, separatePage, updateNote, useNotes } from '../../store';
import { asksBeforeDeleting, moveToTrash } from '../../trash';
import { showToast } from '../../../lib/toasts';
import { fullReminderLabel, hydrateReminders } from '../../reminders';
import { DateTimePicker } from '../../../components/DateTimePicker';
import { deleteKeepingPages, hydratePages, pageBlocksIn, removePageBlocks, RENAME_SUB_NOTE, setPageWidth, stepOverPage, type PageSize } from './pageBlocks';
import { lineBelowTable, typeOutsideComment } from './blockKeys';
import { placeCaret } from './dom';
import { clickedCheckbox, toggleChecked } from './checklist';
import {
  activateTab, addTab, breaksTabBlock, deleteTabBlock, emptyTabAtCaret, removeEmptyTab, removeTab, renameTab, showTabOf, tabPanels
} from './tabs';
import { TitleEditor } from '../../../components/TitleEditor';
import { useEscape } from '../../../lib/useDismiss';
import { selectBlockText } from './selectBlock';
import { LinkPreviewCard } from '../links/LinkPreview';
import { copyPageLink } from '../links/links';
import type { EditorSession } from '../session';
import { elementOf } from '../../../lib/nodes';

type BlockWidgetsProps = {
  session: EditorSession;
  locked: boolean;
  onOpenNote: OpenById;
  onOpenNoteInNewTab: (id: string) => void;

  /* Where else this note shows its own words, outside the editor: a canvas's text boxes, whose */
  /* page links and cards get previews too. */
  area?: () => Element | null;
};

/* How long the pointer rests on a page link before its preview opens (keyboard focus is sooner). */
const PREVIEW_DELAY = 250;
const FOCUS_PREVIEW_DELAY = 150;

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
export function BlockWidgets({ session, locked, onOpenNote, onOpenNoteInNewTab, area }: BlockWidgetsProps) {
  const notes = useNotes();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pageMenu, setPageMenu] = useState<PageMenu | null>(null);

  /* The sub-note whose card title is being renamed in place, and that title. */
  const [renaming, setRenaming] = useState<{ id: string; title: HTMLElement } | null>(null);

  /* The tab whose name is being renamed in place, and its name on the strip. */
  const [renamingTab, setRenamingTab] = useState<{ block: HTMLElement; index: number; title: HTMLElement } | null>(null);

  /* The panel opened by clicking a reminder in the text, under it. */
  const [reminderMenu, setReminderMenu] = useState<{ chip: HTMLElement; top: number; left: number } | null>(null);
  const reminderPanel = useRef<HTMLDivElement>(null);

  /* The panel opens under its reminder, or above it when there is no room below (and always */
  /* inside the window). */
  useLayoutEffect(() => {
    const panel = reminderPanel.current;
    if (!reminderMenu || !panel) return;
    const chip = reminderMenu.chip.getBoundingClientRect();
    const height = panel.offsetHeight;
    const below = chip.bottom + 6;
    const top = below + height <= window.innerHeight - 8 ? below : Math.max(8, chip.top - 6 - height);
    if (top !== reminderMenu.top) setReminderMenu({ ...reminderMenu, top });
  }, [reminderMenu]);

  /* Escape closes it wherever the focus is (clicking a reminder leaves the focus in the note). */
  useEscape(Boolean(reminderMenu), () => setReminderMenu(null));

  /* The menu opened by right-clicking a tab block's strip: on a tab (index), or beside the tabs (-1). */
  const [tabMenu, setTabMenu] = useState<{ block: HTMLElement; index: number; top: number; left: number } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const showTimer = useRef<number | undefined>(undefined);

  /* The page block whose width is being dragged. */
  const resizing = useRef<HTMLElement | null>(null);
  const latest = useRef({ locked, onOpenNote, previewId: preview?.id ?? null, area });
  latest.current = { locked, onOpenNote, previewId: preview?.id ?? null, area };

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

      /* A reminder opens its panel: change its time, or remove it. */
      const reminder = target.closest<HTMLElement>('.reminder-chip');
      if (reminder) {
        event.preventDefault();
        const box = reminder.getBoundingClientRect();
        setReminderMenu({ chip: reminder, top: box.bottom + 6, left: box.left });
        return;
      }

      /* A page block or a page mention opens its page with a normal click. */
      if (block) {
        event.preventDefault();
        if (getNote(block.dataset.page ?? '')) open(block.dataset.page as string, opensNewTab(event));
        return;
      }

      /* A tab block's strip: a tab's name shows that tab, + adds one and × removes one (each one */
      /* undo step). A locked note can still switch tabs to read them, without saving. */
      const tabBlock = target.closest<HTMLElement>('.tab-strip')?.parentElement;
      if (tabBlock) {
        event.preventDefault();
        const index = Number(target.closest<HTMLElement>('[data-tab-index]')?.dataset.tabIndex ?? -1);
        const adding = Boolean(target.closest('.tab-strip-add'));
        const removing = Boolean(target.closest('.tab-strip-remove'));
        if (isLocked && (adding || removing)) return;
        if (!isLocked) session.checkpoint();
        /* A new tab gets the caret before saving, so Undo later returns to it there. */
        if (adding) placeCaret(addTab(tabBlock));
        else if (removing) removeTab(tabBlock, index);
        else if (index >= 0) activateTab(tabBlock, index);
        if (!isLocked) session.commit();
        return;
      }

      /* A checklist item's box ticks or unticks it, as one undo step. */
      const checked = clickedCheckbox(event);
      if (checked) {
        event.preventDefault();
        if (isLocked) return;
        session.checkpoint();
        toggleChecked(checked);
        session.commit();
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

      /* Pressing a reminder opens its panel (on click) without selecting it, which would bring up */
      /* the formatting toolbar. */
      if (target.closest?.('.reminder-chip') && note?.contains(target)) {
        event.preventDefault();
        return;
      }
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

    /* After a short pause, so moving the pointer across the page does not flash previews, the */
    /* preview opens under the page, or above it near the bottom of the window. */
    function showPreviewOf(anchor: HTMLElement, delay: number) {
      window.clearTimeout(hideTimer.current);

      /* Already showing this page: the pointer only moved within it. */
      const id = anchor.dataset.page ?? anchor.dataset.previewPage ?? '';
      if (latest.current.previewId === id) return;
      window.clearTimeout(showTimer.current);
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
      }, delay);
    }

    /* Hovering a page block or a page link in the note (or in a canvas's text boxes) shows a */
    /* preview of its page. */
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
      const shown = inNote && (body()?.contains(inNote) || latest.current.area?.()?.contains(inNote));
      const anchor = listed ?? (shown ? inNote : null);
      if (anchor) showPreviewOf(anchor, PREVIEW_DELAY);
    }

    /* Reaching a page listed in the note's details with Tab shows its preview as well; moving on */
    /* hides it. A click focuses it too, but opens the page anyway, so only keyboard focus counts. */
    function handleFocusIn(event: FocusEvent) {
      const listed = (event.target as Element).closest?.<HTMLElement>('[data-preview-page]');
      if (listed?.matches(':focus-visible') && body()?.closest('.editor-wrap')?.contains(listed)) showPreviewOf(listed, FOCUS_PREVIEW_DELAY);
    }

    function handleFocusOut(event: FocusEvent) {
      if (!(event.target as Element).closest?.('[data-preview-page]')) return;
      window.clearTimeout(showTimer.current);
      if (!(event.relatedTarget as Element | null)?.closest?.('[data-preview-page]')) setPreview(null);
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

      /* Nothing is typed over a selection that would break a tab block (see breaksTabBlock). */
      if (breaksTabBlock(range, note)) {
        event.preventDefault();
        return;
      }
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
      const blockOf = (node: Node) => elementOf(node)?.closest('.block-content');
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

      /* Right-clicking a tab block's strip opens the tab menu (text inside a tab keeps the */
      /* browser's own menu, with its spelling suggestions). */
      const tabBlock = target.closest?.('.tab-strip')?.parentElement;
      if (tabBlock && body()?.contains(tabBlock) && !latest.current.locked) {
        event.preventDefault();
        const index = Number(target.closest<HTMLElement>('[data-tab-index]')?.dataset.tabIndex ?? -1);
        setTabMenu({ block: tabBlock as HTMLElement, index, top: event.clientY, left: event.clientX });
        return;
      }
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
      if ((event.target as Element).closest?.('.page-menu')) return;
      setPageMenu(null);
      setTabMenu(null);
      setReminderMenu(null);
    }

    /* A caret that ends up in a hidden tab (put there by code, not by clicking) shows that tab, */
    /* so nothing is ever typed out of sight. */
    function handleSelectionChange() {
      const node = window.getSelection()?.focusNode ?? null;
      const element = elementOf(node);
      if (element?.closest('.tab-panel:not(.is-active)') && body()?.contains(element)) showTabOf(element);
    }

    /* Backspace in an empty tab removes it (the block, with its last tab), as one undo step taken */
    /* before the change, so Undo puts the caret back in that tab. Ctrl + A in a table cell, code */
    /* block, toggle list, quote, list or tab selects just that block; pressed again, the whole */
    /* note (skipping Block mode's own step of selecting the block). */
    function handleKeyDown(event: KeyboardEvent) {
      const empty = latest.current.locked ? null : emptyTabAtCaret(event);
      if (empty && body()?.contains(empty)) {
        event.preventDefault();
        event.stopPropagation();
        session.checkpoint();
        const caretLine = removeEmptyTab(empty);
        session.commit();
        placeCaret(caretLine, true);
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'a') return;
      const step = selectBlockText(body());
      if (!step) return;
      event.preventDefault();
      event.stopPropagation();
      if (step === 'note') session.selectAll(true);
    }

    /* Double-clicking a tab's name renames it in place. */
    function handleDoubleClick(event: MouseEvent) {
      const name = (event.target as Element).closest?.<HTMLElement>('.tab-strip-name');
      const block = name?.closest('.tab-strip')?.parentElement;
      if (!name || !block || latest.current.locked || !body()?.contains(block)) return;
      event.preventDefault();
      const index = Number(name.closest<HTMLElement>('[data-tab-index]')?.dataset.tabIndex ?? -1);
      setRenamingTab({ block, index, title: name });
    }

    /* A sub-note just made and left closed is named on its card, once the card is in view. */
    function handleRename(event: Event) {
      const id = (event as CustomEvent<string>).detail;
      const block = blockOf(id);
      if (!block) return;
      block.scrollIntoView({ block: 'nearest' });
      requestAnimationFrame(() => startRename(id));
    }

    window.addEventListener(RENAME_SUB_NOTE, handleRename);
    document.addEventListener('dblclick', handleDoubleClick);
    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('selectionchange', handleSelectionChange);
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
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      window.removeEventListener(RENAME_SUB_NOTE, handleRename);
      document.removeEventListener('dblclick', handleDoubleClick);
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('selectionchange', handleSelectionChange);
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

  /* Moving a sub-note to Trash also takes its card out of this note's text (in the store, so */
  /* restoring can put it back where it was); the editor then shows that at once. */
  function trashSubNote(id: string, withSubNotes: boolean) {
    moveToTrash(id, withSubNotes);
    session.catchUpHere();
  }

  function confirmDelete(withSubNotes: boolean) {
    if (!deleting) return;
    trashSubNote(deleting, withSubNotes);
    setDeleting(null);
  }

  function blockOf(id: string) {
    return Array.from(session.body()?.querySelectorAll<HTMLElement>('.page-block') ?? []).find(item => item.dataset.page === id) ?? null;
  }

  /* Rename edits the title on the sub-note's card itself. */
  function startRename(id: string) {
    const title = blockOf(id)?.querySelector<HTMLElement>('.page-block-text strong');
    setPageMenu(null);
    setPreview(null);
    if (title) setRenaming({ id, title });
  }

  /* The menu closes as it copies, so a toast says whether the link was copied. */
  function copyWithToast(id: string) {
    copyPageLink(id)
      .then(() => showToast({ kind: 'success', title: 'Link copied', description: noteTitle(getNote(id)) }))
      .catch(() => showToast({ kind: 'error', title: 'The link could not be copied', description: 'The browser did not allow copying. Try Note settings → Copy link.' }));
  }

  /* A change to the reminder whose panel is open, as one undo step. */
  function changeChip(change: (chip: HTMLElement) => void) {
    const chip = reminderMenu?.chip;
    if (!chip?.isConnected || locked) return;
    session.checkpoint();
    change(chip);
    hydrateReminders(chip.parentElement);
    session.commit();

    /* Draw the panel again, so its date follows the change. */
    setReminderMenu(menu => (menu ? { ...menu } : null));
  }

  /* A change from the tab menu, as one undo step. */
  function changeTabs(change: (block: HTMLElement) => void) {
    const block = tabMenu?.block;
    setTabMenu(null);
    if (!block?.isConnected) return;
    session.checkpoint();
    change(block);
    session.commit();
  }

  /* After naming a sub-note, writing carries on just after its block (past the space after it). */
  function returnAfterBlock(id: string) {
    const note = session.body();
    const block = blockOf(id);
    if (!note || !block) return;
    note.focus({ preventScroll: true });
    const caret = document.createRange();
    const next = block.nextSibling;
    if (next instanceof Text && next.data.startsWith(' ')) caret.setStart(next, 1);
    else caret.setStartAfter(block);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(caret);
  }

  const menuNote = pageMenu ? getNote(pageMenu.id) : undefined;

  return (
    <>
      {preview && (
        <div className="page-preview" style={{ top: preview.top, left: preview.left, transform: preview.above ? 'translateY(-100%)' : undefined }} role="tooltip">
          <LinkPreviewCard target={{ kind: 'page', id: preview.id }} />
        </div>
      )}

      {/* Open note, or open it in a new tab; Rename edits the title on its card (only for a card in the text). */}
      {/* Copy link copies the page's address. Separate page moves it out of this note (up one level); */}
      {/* Delete removes it for good, after asking. */}
      {pageMenu && (
        <div
          className="page-menu"
          role="menu"
          aria-label="Sub-note options"
          style={{ top: Math.min(pageMenu.top, window.innerHeight - 240), left: Math.min(pageMenu.left, window.innerWidth - 220) }}
          onKeyDown={event => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            setPageMenu(null);
          }}
        >
          <button type="button" role="menuitem" className="page-menu-item" disabled={!menuNote} onClick={() => { setPageMenu(null); onOpenNote(pageMenu.id); }}>
            <Icon name="arrow-right" size={14} /> Open note
          </button>
          <button type="button" role="menuitem" className="page-menu-item" disabled={!menuNote} onClick={() => { setPageMenu(null); onOpenNoteInNewTab(pageMenu.id); }}>
            <Icon name="external-link" size={14} /> Open in new tab
          </button>
          {!locked && blockOf(pageMenu.id) && (
            <button type="button" role="menuitem" className="page-menu-item" disabled={!menuNote} onClick={() => startRename(pageMenu.id)}>
              <Icon name="pencil" size={14} /> Rename
            </button>
          )}
          <button type="button" role="menuitem" className="page-menu-item" disabled={!menuNote} onClick={() => { setPageMenu(null); copyWithToast(pageMenu.id); }}>
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
                  if (!menuNote) removeFromText(pageMenu.id);
                  else if (asksBeforeDeleting(pageMenu.id)) setDeleting(pageMenu.id);
                  else trashSubNote(pageMenu.id, false);
                }}
              >
                <Icon name="trash" size={14} /> {menuNote ? 'Delete sub-note' : 'Remove from note'}
              </button>
            </>
          )}
        </div>
      )}

      {renaming && (
        <TitleEditor
          anchor={renaming.title}
          value={getNote(renaming.id)?.title ?? ''}
          onSave={title => updateNote(renaming.id, { title })}
          onClose={() => {
            setRenaming(null);
            returnAfterBlock(renaming.id);
          }}
        />
      )}

      {/* A reminder's panel: its full date, a calendar and time to change it, and Remove. A locked */}
      {/* note shows only the date. */}
      {reminderMenu && (
        <div
          ref={reminderPanel}
          className="page-menu reminder-panel"
          role="dialog"
          aria-label="Reminder"
          style={{ top: reminderMenu.top, left: Math.max(8, Math.min(reminderMenu.left, window.innerWidth - 280)) }}
        >
          <p className="reminder-panel-date"><Icon name="alarm-clock" size={14} /> {fullReminderLabel(reminderMenu.chip.dataset.at ?? '')}</p>
          {!locked && (
            <>
              <DateTimePicker
                value={new Date(reminderMenu.chip.dataset.at ?? Date.now())}
                onChange={at => changeChip(chip => {
                  chip.dataset.at = at.toISOString();
                })}
              />
              <span className="reminder-panel-actions">
                <button
                  type="button"
                  className="btn btn-sm btn-tertiary is-danger"
                  onClick={() => {
                    changeChip(chip => chip.remove());
                    setReminderMenu(null);
                  }}
                >
                  Remove
                </button>
              </span>
            </>
          )}
        </div>
      )}

      {/* Right-clicking a tab: rename it (in place), delete it, or delete the whole block. Beside */}
      {/* the tabs: add a tab, or delete the block. Each change is one undo step. */}
      {tabMenu && (
        <div
          className="page-menu"
          role="menu"
          aria-label="Tab options"
          style={{ top: Math.min(tabMenu.top, window.innerHeight - 140), left: Math.min(tabMenu.left, window.innerWidth - 220) }}
          onKeyDown={event => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            setTabMenu(null);
          }}
        >
          {tabMenu.index >= 0 ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="page-menu-item"
                autoFocus
                onClick={() => {
                  const title = tabMenu.block.querySelector<HTMLElement>(`[data-tab-index="${tabMenu.index}"] .tab-strip-name`);
                  setTabMenu(null);
                  if (title) setRenamingTab({ block: tabMenu.block, index: tabMenu.index, title });
                }}
              >
                <Icon name="pencil" size={14} /> Rename tab
              </button>
              {tabPanels(tabMenu.block).length > 1 && (
                <button type="button" role="menuitem" className="page-menu-item" onClick={() => changeTabs(block => removeTab(block, tabMenu.index))}>
                  <Icon name="x" size={14} /> Delete tab
                </button>
              )}
            </>
          ) : (
            <button type="button" role="menuitem" className="page-menu-item" autoFocus onClick={() => changeTabs(block => placeCaret(addTab(block)))}>
              <Icon name="plus" size={14} /> Add tab
            </button>
          )}
          <button type="button" role="menuitem" className="page-menu-item is-danger" onClick={() => changeTabs(block => placeCaret(deleteTabBlock(block)))}>
            <Icon name="trash" size={14} /> Delete tab block
          </button>
        </div>
      )}

      {renamingTab && (
        <TitleEditor
          anchor={renamingTab.title}
          value={renamingTab.title.textContent ?? ''}
          onSave={title => {
            session.checkpoint();
            renameTab(renamingTab.block, renamingTab.index, title);
            session.commit();
          }}
          onClose={() => setRenamingTab(null)}
        />
      )}

      {deleting && <DeleteNoteDialog noteId={deleting} sub onConfirm={confirmDelete} onCancel={() => setDeleting(null)} />}
    </>
  );
}
