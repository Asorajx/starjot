import { memo, useEffect, useLayoutEffect, useRef, type ClipboardEvent, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { cleanHtml } from '../../sanitize';
import { usePreferences } from '../../../app/preferences';
import { getRange, setOffset, setRange } from './caret';
import { deleteKeepingPages, hydratePages } from './pageBlocks';
import { handleBlockKeys } from './blockKeys';
import { hydrateTables } from '../tables/tables';
import { highlight, highlightAll, insertNewline, preAtCaret } from '../code/code';
import { caretAtEdge, closestAtCaret, emptyParagraph, placeCaret, selectContents, wrapLooseLines } from './dom';
import { dividerKeys, selectDividerAtCaret } from './dividers';
import { joinAdjacentLists } from './lines';
import { imageFiles, insertImageFiles } from '../images/images';
import { linkTypedAddress } from '../links/links';
import { applyMarkdownShortcut, joinTypedDashes } from './markdown';
import { deleteSelection, insertPasted } from './paste';
import { pastedLines, writeSelection } from './clipboard';
import { clearSelectedCells, pasteIntoTable } from '../tables/tableClipboard';
import { stickyStateForRange, toggleStickyRange } from './stickyDom';
import type { EditorSession } from '../session';

type ContinuousEditorProps = {
  session: EditorSession;
  content: string;
  locked: boolean;
};


/* =========================
   Continuous Editor
   ========================= */

/* The note is one flowing, editable document. */
/* React renders the empty element once; after that the browser and these handlers own its contents. */
/* memo: typing updates the note, but the editor itself never needs to re-render for it. */
export const ContinuousEditor = memo(function ContinuousEditor({ session, content, locked }: ContinuousEditorProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const { spellcheck } = usePreferences();

  /* The last selection inside the note, kept so toolbar clicks know what was selected. */
  const savedRange = useRef<Range | null>(null);

  /* The session finds this editor's text through it (overlays, undo, the slash menu). */
  useLayoutEffect(() => {
    session.setBody(bodyRef.current);
    return () => session.setBody(null);
  }, [session]);

  /* Read the document from the page, tidy it, and save it. Lists that end up side by side are */
  /* joined; moving their items loses the caret, so it is put back by its place in the text. */
  function commit() {
    const body = bodyRef.current;
    if (!body) return;
    wrapLooseLines(body);
    if (body.querySelector('ul + ul, ol + ol')) {
      const caret = getRange(body);
      if (joinAdjacentLists(body) && caret) setRange(body, caret.start, caret.end);
    }
    session.save(body.innerHTML);
  }

  function refreshSticky() {
    const body = bodyRef.current;
    if (body) session.setSticky(stickyStateForRange(body, savedRange.current));
  }

  /* Fill the editor when it first appears. The content prop is only read here: */
  /* after undo/redo the parent re-creates the editor to show the new document. */
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.innerHTML = cleanHtml(content) || '<p><br></p>';
    wrapLooseLines(body);
    highlightAll(body);
    hydratePages(body);
    hydrateTables(body);
    if (session.pendingCaret !== null) {
      setOffset(body, session.pendingCaret);
      session.pendingCaret = null;
    }
    session.relayout();
  }, []);

  /* Register this editor's actions with the session (Sticky button, Ctrl+A, code language changes). */
  useEffect(() => {
    session.setAdapter({
      commit,
      selectAll() {
        const body = bodyRef.current;
        if (!body) return;
        body.focus();
        selectContents(body);
      },
      toggleSticky() {
        const body = bodyRef.current;
        if (!body) return;
        const selection = getRange(body);
        session.checkpoint();
        if (!toggleStickyRange(body, savedRange.current)) return;

        /* Moving nodes clears the browser selection, so restore it from character offsets. */
        if (selection) setRange(body, selection.start, selection.end);
        commit();
        refreshSticky();
      },
      linesChanged(focus, atEnd) {
        if (focus) placeCaret(focus, atEnd);
        commit();
      }
    });
    return () => session.setAdapter(null);
  });

  /* Native listeners: React's onBeforeInput does not report the input type needed for undo. */
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;

    function handleBeforeInput(event: InputEvent) {
      if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
        event.preventDefault();
        if (event.inputType === 'historyUndo') session.undo();
        else session.redo();
        return;
      }
      session.beforeInput(event);
    }

    /* Track the selection for the Sticky button; forget it when another field is being edited. */
    function handleSelectionChange() {
      const selection = window.getSelection();
      if (body && selection?.rangeCount && selection.anchorNode && body.contains(selection.anchorNode)) {
        savedRange.current = selection.getRangeAt(0).cloneRange();
      } else if (document.activeElement?.matches('input, textarea, select')) {
        savedRange.current = null;
      }
      refreshSticky();
      if (body) selectDividerAtCaret(body);

      /* Selecting text inside a group shows its brackets, even when indicators are hidden. */
      const range = selection?.rangeCount && selection.anchorNode && body?.contains(selection.anchorNode) ? selection.getRangeAt(0) : null;
      body?.querySelectorAll('.sticky-group').forEach(group => {
        group.classList.toggle('is-revealed', Boolean(range && !range.collapsed && range.intersectsNode(group)));
      });
    }

    body.addEventListener('beforeinput', handleBeforeInput);
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      body.removeEventListener('beforeinput', handleBeforeInput);
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  });

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const body = bodyRef.current;
    const native = event.nativeEvent;
    if (!body || native.isComposing || locked) return;

    /* A selected divider: the arrow keys step past it and Enter adds a line below it. */
    const dividerKey = dividerKeys(native, body);
    if (dividerKey) {
      if (dividerKey === 'changed') {
        session.checkpoint();
        commit();
      }
      return;
    }

    /* In code, Enter adds a code line; Shift + Enter leaves the code block. */
    const pre = preAtCaret(body);
    if (pre && event.key === 'Enter' && !event.altKey) {
      event.preventDefault();
      session.checkpoint();
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        const group = pre.parentElement?.classList.contains('sticky-group') && pre === pre.parentElement.lastElementChild ? pre.parentElement : null;
        const paragraph = emptyParagraph();
        (group ?? pre).after(paragraph);
        placeCaret(paragraph);
      } else {
        insertNewline(pre);
      }
      commit();
      return;
    }

    /* Enter on an empty last line of a quote leaves the quote, as in a list: the empty line moves */
    /* out to just after the quote (pressing Enter twice at its end continues below it). */
    const quote = closestAtCaret('blockquote');
    const quoteLine = quote ? closestAtCaret('p') : null;
    if (event.key === 'Enter' && !event.shiftKey && quote && quoteLine && body.contains(quote) && window.getSelection()?.isCollapsed
      && quoteLine.parentElement === quote && quoteLine === quote.lastElementChild && !quoteLine.textContent?.trim() && !quoteLine.querySelector('.image-block, .page-block')) {
      event.preventDefault();
      session.checkpoint();
      quoteLine.remove();
      const paragraph = emptyParagraph();
      if (quote.childElementCount) quote.after(paragraph);
      else quote.replaceWith(paragraph);
      placeCaret(paragraph);
      commit();
      return;
    }

    /* A web address typed just before Space or Enter becomes a link first. */
    if ((event.key === ' ' || event.key === 'Enter') && !event.altKey && !event.ctrlKey && !event.metaKey) linkTypedAddress(body);

    /* Tab, Enter and Backspace work differently inside table cells and toggle lists. */
    const result = handleBlockKeys(native, body);
    if (result) {
      if (result.kind === 'blocked') return;
      session.checkpoint();
      if (result.kind === 'lines') placeCaret(result.focus, result.atEnd);
      commit();
      return;
    }

    /* Expand Markdown markers such as # or - before the browser inserts the space. */
    /* The checkpoint can follow the change: history still holds the content from before it. */
    if (applyMarkdownShortcut(native, body)) {
      session.checkpoint();
      commit();
      return;
    }

    /* New lines typed at either edge of a sticky group are placed outside the group. */
    const group = closestAtCaret('.sticky-group');
    const selection = window.getSelection();
    if (event.key === 'Enter' && !event.shiftKey && group && body.contains(group) && selection?.isCollapsed && !closestAtCaret('li')) {
      if (caretAtEdge(group, 'end')) {
        event.preventDefault();
        session.checkpoint();
        const paragraph = emptyParagraph();
        group.after(paragraph);
        placeCaret(paragraph);
        commit();
      } else if (caretAtEdge(group, 'start')) {
        event.preventDefault();
        session.checkpoint();
        group.before(emptyParagraph());
        commit();
      }
    }
  }

  function handleInput(event: FormEvent<HTMLDivElement>) {
    const body = bodyRef.current;
    if (!body || (event.nativeEvent as InputEvent).isComposing) return;

    /* Re-colour code first so the saved content includes the updated tokens. */
    const pre = preAtCaret(body);
    if (pre) highlight(pre);
    commit();
    if (joinTypedDashes(event.nativeEvent as InputEvent, body, () => session.checkpoint())) commit();
  }

  /* Paste plain text only, so external HTML cannot bring in styles or scripts. Markdown in the */
  /* text (links, bold, lists, headings and so on) is formatted, except when pasting into code. */
  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const body = bodyRef.current;
    event.preventDefault();
    if (!body || locked) return;

    /* A copied picture (or picture file) is added as an image. */
    const images = imageFiles(event.clipboardData);
    if (images.length && !preAtCaret(body)) {
      insertImageFiles(session, images);
      return;
    }
    session.checkpoint();
    const text = event.clipboardData.getData('text/plain');
    const pre = preAtCaret(body);
    const lines = pre ? null : pastedLines(event.clipboardData);

    /* In a table, copied cells go in cell by cell (see tableClipboard.ts). */
    if (!pre && pasteIntoTable(event.clipboardData, body, lines)) {
      commit();
      return;
    }
    if (lines) {
      deleteSelection(body);
      insertPasted(body, lines);
      commit();
      return;
    }

    /* Pasting over a selection that holds page blocks keeps the blocks. */
    const selected = window.getSelection()?.rangeCount ? window.getSelection()?.getRangeAt(0) : null;
    if (selected && !selected.collapsed && deleteKeepingPages(selected, body, text)) {
      commit();
      return;
    }

    /* Inside code, insert the text directly so its line breaks stay as code lines. */
    if (pre || !document.execCommand('insertText', false, text)) {
      const range = window.getSelection()?.getRangeAt(0);
      if (!range) return;
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      if (pre) highlight(pre);
      commit();
    }
  }

  /* Copying keeps the kind of each line (see clipboard.ts), so pasting into a note brings it back. */
  function handleCopy(event: ClipboardEvent<HTMLDivElement>) {
    const body = bodyRef.current;
    if (body) writeSelection(event.nativeEvent, body);
  }

  /* Cutting copies the same way, then deletes the selection as an ordinary edit. */
  function handleCut(event: ClipboardEvent<HTMLDivElement>) {
    const body = bodyRef.current;
    if (!body || locked) {
      event.preventDefault();
      return;
    }
    if (!writeSelection(event.nativeEvent, body)) return;

    /* Cut table cells are emptied, keeping the table's shape. */
    if (clearSelectedCells(body)) commit();
    else document.execCommand('delete');
  }

  /* Double-clicking the side of a sticky group selects the whole group. */
  function handleDoubleClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (!target.classList.contains('sticky-group')) return;
    event.preventDefault();
    selectContents(target);
    savedRange.current = window.getSelection()?.getRangeAt(0).cloneRange() ?? null;
    refreshSticky();
  }

  return (
    <div
      ref={bodyRef}
      className="note-body article-body continuous-document note-editable"
      data-note-editable=""
      contentEditable={!locked}
      suppressContentEditableWarning
      spellCheck={spellcheck}
      role="textbox"
      aria-multiline="true"
      aria-label="Document content"
      onKeyDown={handleKeyDown}
      onInput={handleInput}
      onPaste={handlePaste}
      onCopy={handleCopy}
      onCut={handleCut}
      onDoubleClick={handleDoubleClick}
    />
  );
}, (previous, next) => previous.session === next.session && previous.locked === next.locked);
