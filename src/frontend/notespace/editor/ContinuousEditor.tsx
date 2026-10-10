import { memo, useEffect, useLayoutEffect, useRef, type ClipboardEvent, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { cleanHtml } from '../sanitize';
import { getRange, setOffset, setRange } from './caret';
import { highlight, highlightAll, insertNewline, preAtCaret } from './code';
import { caretAtEdge, closestAtCaret, emptyParagraph, placeCaret, selectContents, wrapLooseLines } from './dom';
import { applyMarkdownShortcut } from './markdown';
import { stickyStateForRange, toggleStickyRange } from './stickyDom';
import type { EditorSession } from './session';

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

  /* The last selection inside the note, kept so toolbar clicks know what was selected. */
  const savedRange = useRef<Range | null>(null);

  /* Read the document from the page, tidy it, and save it. */
  function commit() {
    const body = bodyRef.current;
    if (!body) return;
    wrapLooseLines(body);
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
  }

  /* Paste plain text only, so external HTML cannot bring in styles or scripts. */
  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const body = bodyRef.current;
    event.preventDefault();
    if (!body || locked) return;
    session.checkpoint();
    const text = event.clipboardData.getData('text/plain');
    const pre = preAtCaret(body);

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

  /* Links open in a new tab with Ctrl + click, or with a normal click on a locked note. */
  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
    if (!link || !(locked || event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    window.open(link.href, '_blank', 'noopener');
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
      id="note-body"
      className="article-body continuous-document note-editable"
      data-note-editable=""
      contentEditable={!locked}
      suppressContentEditableWarning
      spellCheck
      role="textbox"
      aria-multiline="true"
      aria-label="Document content"
      onKeyDown={handleKeyDown}
      onInput={handleInput}
      onPaste={handlePaste}
      onDoubleClick={handleDoubleClick}
      onClick={handleClick}
    />
  );
}, (previous, next) => previous.session === next.session && previous.locked === next.locked);
