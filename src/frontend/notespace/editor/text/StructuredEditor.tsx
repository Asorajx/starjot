import {
  memo, useCallback, useEffect, useLayoutEffect, useRef, useState,
  type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode
} from 'react';
import { flushSync } from 'react-dom';
import { cleanHtml } from '../../sanitize';
import { BlockRow } from './BlockRow';
import {
  groupForNewBlock, makeBlock, normalizeGroups, parseBlocks, serializeBlocks, stickBlocks, stickyStateFor, unstickGroup,
  type DocBlock
} from './blockModel';
import { isRuleOnly, mergeContents, splitAtCaret } from './blockEditing';
import { deleteKeepingPages, hydratePages, pageBlocksIn } from './pageBlocks';
import { handleBlockKeys } from './blockKeys';
import { joinLineOfToggle } from './lines';
import { breaksTabBlock } from './tabs';
import { getLength, getOffset, setOffset } from './caret';
import { highlight, insertNewline, preAtCaret } from '../code/code';
import { caretAtEdge, closestAtCaret, emptyParagraph, isEmptyContent, placeCaret, selectContents, selectionInside, wrapLooseLines } from './dom';
import { imageFiles, insertImageFiles } from '../images/images';
import { linkTypedAddress } from '../links/links';
import { applyMarkdownShortcut, joinTypedDashes } from './markdown';
import { deleteSelection, insertPasted, pastedMarkdown } from './paste';
import { pastedSource, withCopiedTables, writeSelection } from './clipboard';
import { clearSelectedCells, pasteIntoTable } from '../tables/tableClipboard';
import type { EditorSession } from '../session';

type StructuredEditorProps = {
  session: EditorSession;
  content: string;
  locked: boolean;
};

type CaretPosition = 'start' | 'end' | number;

/* path: the position of one element inside the block (in document order), for a caret that */
/* belongs in a specific place such as the first table cell, rather than the start of the block. */
type FocusRequest = { id: string; position: CaretPosition; path?: number };
type DropMark = { id: string; side: 'before' | 'after' };

/* What the current text selection touches: the block with the caret, and every block in the selection. */
type SelectionState = { activeId: string | null; picked: string[]; collapsed: boolean };

const NO_SELECTION: SelectionState = { activeId: null, picked: [], collapsed: true };


/* =========================
   Structured Editor
   ========================= */

/* Shows the note as separate blocks inside one editable area, so text can be selected across */
/* blocks like a normal document. React owns the list of blocks (order, groups, new blocks); */
/* the browser owns the text inside each block while the user types. */
/* memo: typing updates the note, but the editor itself never needs to re-render for it. */
export const StructuredEditor = memo(function StructuredEditor({ session, content, locked }: StructuredEditorProps) {
  const [blocks, setBlocks] = useState(() => parseBlocks(cleanHtml(content)));
  const [selection, setSelection] = useState<SelectionState>(NO_SELECTION);
  const [dropMark, setDropMark] = useState<DropMark | null>(null);
  const [draggingIds, setDraggingIds] = useState<string[]>([]);

  /* Refs hold the latest values for event handlers that run outside React's render. */
  const bodyRef = useRef<HTMLDivElement>(null);
  const blocksRef = useRef(blocks);
  const selectionRef = useRef(selection);
  const elements = useRef(new Map<string, HTMLDivElement>());
  const focusRequest = useRef<FocusRequest | null>(null);
  const draggedIds = useRef<string[]>([]);

  /* True while the second part of one edit is applied (a paste after deleting across blocks), */
  /* so both parts are undone together. */
  const continuingEdit = useRef(false);
  selectionRef.current = selection;

  const register = useCallback((id: string, element: HTMLDivElement | null) => {
    if (element) elements.current.set(id, element);
    else elements.current.delete(id);
  }, []);

  /* The session finds this editor's text through it (overlays, undo, the slash menu). */
  useLayoutEffect(() => {
    session.setBody(bodyRef.current);
    return () => session.setBody(null);
  }, [session]);

  /* The blocks with the latest typed HTML read from the page. */
  function liveBlocks() {
    return blocksRef.current.map(block => {
      const element = elements.current.get(block.id);
      return element ? { ...block, html: element.innerHTML } : block;
    });
  }

  function blockIdOf(node: Node | null) {
    const element = node instanceof Element ? node : node?.parentElement;
    return element?.closest<HTMLElement>('[data-block-id]')?.dataset.blockId ?? null;
  }

  /* Save typing inside a block. */
  function commitTyping() {
    session.save(serializeBlocks(liveBlocks()));
  }

  /* Apply a structural change: re-render the blocks, move the caret and save it as one undo step. */
  function applyBlocks(next: DocBlock[], focus: FocusRequest | null) {
    if (!continuingEdit.current) session.checkpoint();
    const normalized = normalizeGroups(next);
    blocksRef.current = normalized;
    setBlocks(normalized);
    focusRequest.current = focus;
    session.save(serializeBlocks(normalized), null);
  }

  /* Picked blocks, or the block with the caret when no text is selected. */
  function targetIds() {
    const current = selectionRef.current;
    if (current.picked.length) return current.picked;
    return current.activeId ? [current.activeId] : [];
  }

  /* A block in a sticky group moves with its whole group, unless only that block has text selected. */
  function unitFor(id: string) {
    const block = blocksRef.current.find(item => item.id === id);
    const current = selectionRef.current;
    const onlyThisSelected = !current.collapsed && current.picked.length === 1 && current.picked[0] === id;
    if (!block?.group || onlyThisSelected) return [id];
    return blocksRef.current.filter(item => item.group === block.group).map(item => item.id);
  }

  function focusBlock(id: string, position: CaretPosition, path?: number) {
    const element = elements.current.get(id);
    if (!element) return;

    /* The end of a toggle block is the end of its last line, or of its title when it has none, */
    /* never its empty body. */
    const last = element.lastElementChild;
    const toggleEnd = position === 'end' && path === undefined && last?.classList.contains('toggle-block') ? joinLineOfToggle(last) : null;
    const target = toggleEnd ?? (path === undefined ? null : element.querySelectorAll('*')[path]);
    if (target) {
      bodyRef.current?.focus({ preventScroll: true });
      if (typeof position === 'number') setOffset(target, position);
      else placeCaret(target, position === 'end');
    } else if (typeof position === 'number') {
      setOffset(element, position);
    } else {
      bodyRef.current?.focus({ preventScroll: true });
      placeCaret(element, position === 'end');
    }
  }

  /* After the blocks re-render, move the caret to where the last change asked for it. */
  useLayoutEffect(() => {
    const request = focusRequest.current;
    if (!request) return;
    focusRequest.current = null;
    focusBlock(request.id, request.position, request.path);
    session.updateCaret();
  });

  /* Restore the caret after undo/redo re-created this editor. */
  useLayoutEffect(() => {
    if (session.pendingCaret !== null) {
      setOffset(bodyRef.current, session.pendingCaret);
      session.pendingCaret = null;
    }
    session.relayout();
  }, [session]);

  /* The Sticky button reflects the selected blocks. */
  useEffect(() => {
    session.setSticky(stickyStateFor(blocks, selection.picked.length ? selection.picked : selection.activeId ? [selection.activeId] : []));
  }, [session, blocks, selection]);


  /* =========================
     Block Actions
     ========================= */

  function addBlock(id: string, position: 'above' | 'below') {
    if (locked) return;
    const live = liveBlocks();
    const index = live.findIndex(block => block.id === id);
    const block = makeBlock('<p><br></p>', groupForNewBlock(live, index, position));
    live.splice(position === 'below' ? index + 1 : index, 0, block);
    applyBlocks(live, { id: block.id, position: 'start' });
  }

  /* Move a block (or a whole sticky group) one step up or down. Free blocks jump over whole groups. */
  /* A single block inside a group moves within the group, and leaves it at either end. */
  function moveUnit(ids: string[], direction: -1 | 1) {
    const live = liveBlocks();
    const start = live.findIndex(block => block.id === ids[0]);
    const end = start + ids.length - 1;
    const first = live[start];

    if (ids.length === 1 && first.group) {
      const neighbour = live[start + direction];
      if (neighbour?.group === first.group) {
        live.splice(start, 1);
        live.splice(start + direction, 0, first);
      } else {
        live[start] = { ...first, group: null };
      }
      applyBlocks(live, { id: first.id, position: 'end' });
      return;
    }

    let spanStart = direction < 0 ? start - 1 : end + 1;
    const neighbour = live[spanStart];
    if (!neighbour) return;
    let spanEnd = spanStart;
    if (neighbour.group) {
      while (live[spanStart - 1]?.group === neighbour.group) spanStart -= 1;
      while (live[spanEnd + 1]?.group === neighbour.group) spanEnd += 1;
    }

    const unit = live.splice(start, ids.length);
    live.splice(direction < 0 ? spanStart : spanEnd - unit.length + 1, 0, ...unit);
    applyBlocks(live, { id: first.id, position: 'end' });
  }

  /* Enter splits the block at the caret. New lines at the edge of a sticky group stay outside it. */
  function splitBlock(editable: HTMLElement, id: string) {
    const live = liveBlocks();
    const index = live.findIndex(block => block.id === id);

    /* At the start of a block, add an empty line above and keep the caret with the text. */
    if (caretAtEdge(editable, 'start') && !isEmptyContent(editable)) {
      live.splice(index, 0, makeBlock('<p><br></p>', groupForNewBlock(live, index, 'above')));
      applyBlocks(live, { id, position: 'start' });
      return;
    }

    const atEnd = caretAtEdge(editable, 'end');
    const nextHtml = splitAtCaret(editable);
    live[index] = { ...live[index], html: editable.innerHTML };
    const block = makeBlock(nextHtml, atEnd ? groupForNewBlock(live, index, 'below') : live[index].group);
    live.splice(index + 1, 0, block);
    applyBlocks(live, { id: block.id, position: 'start' });
  }

  /* Enter on an empty last list item ends the list with a new paragraph block. */
  function exitList(item: HTMLElement, editable: HTMLElement, id: string) {
    const live = liveBlocks();
    const index = live.findIndex(block => block.id === id);
    const list = item.parentElement as HTMLElement;

    if (list.children.length === 1) {
      list.replaceWith(emptyParagraph());
      live[index] = { ...live[index], html: editable.innerHTML, version: live[index].version + 1 };
      applyBlocks(live, { id, position: 'end' });
      return;
    }
    item.remove();
    live[index] = { ...live[index], html: editable.innerHTML };
    const block = makeBlock('<p><br></p>', groupForNewBlock(live, index, 'below'));
    live.splice(index + 1, 0, block);
    applyBlocks(live, { id: block.id, position: 'start' });
  }

  /* Backspace and Delete join blocks like normal text editing. */
  /* An empty block is removed and the caret returns to the end of the previous block. */
  function handleDeletion(event: KeyboardEvent, editable: HTMLElement, id: string) {
    const current = window.getSelection();
    if (event.altKey || !current?.isCollapsed || !selectionInside(editable)) return;

    const live = liveBlocks();
    const index = live.findIndex(block => block.id === id);
    const previous = live[index - 1];
    const next = live[index + 1];
    const backward = event.key === 'Backspace';

    /* The only block is never removed: emptied, it becomes a plain empty line. The browser would */
    /* otherwise delete the block's own frame and leave nowhere to type. */
    if (isEmptyContent(editable) && !previous && !next) {
      event.preventDefault();
      if (editable.innerHTML !== '<p><br></p>') {
        live[index] = { ...live[index], html: '<p><br></p>', version: live[index].version + 1 };
        applyBlocks(live, { id, position: 'start' });
      }
      return;
    }

    if (isEmptyContent(editable)) {
      event.preventDefault();
      live.splice(index, 1);
      applyBlocks(live, previous ? { id: previous.id, position: 'end' } : { id: next.id, position: 'start' });
      return;
    }

    const upper = backward ? previous : live[index];
    const lower = backward ? live[index] : next;
    if (!caretAtEdge(editable, backward ? 'start' : 'end')) return;
    event.preventDefault();

    /* Nothing to join with (the start of the first block or the end of the last). Backspace at */
    /* the start of a heading turns it into normal text, like in other editors. */
    if (!upper || !lower) {
      const first = editable.firstElementChild;
      if (backward && first && /^H[1-6]$/.test(first.tagName) && !first.classList.contains('toggle-summary')) {
        const paragraph = document.createElement('p');
        paragraph.append(...Array.from(first.childNodes));
        first.replaceWith(paragraph);
        live[index] = { ...live[index], html: editable.innerHTML, version: live[index].version + 1 };
        applyBlocks(live, { id, position: 'start' });
      }
      return;
    }

    const upperElement = elements.current.get(upper.id) as HTMLElement;
    const lowerElement = elements.current.get(lower.id) as HTMLElement;
    const upperIndex = live.indexOf(upper);

    /* A divider next to the caret is simply removed. */
    if (isRuleOnly(backward ? upperElement : lowerElement)) {
      live.splice(backward ? upperIndex : upperIndex + 1, 1);
      applyBlocks(live, { id, position: backward ? 'start' : 'end' });
      return;
    }

    const merged = mergeContents(upperElement, lowerElement);
    live[upperIndex] = { ...upper, html: merged.html, version: upper.version + 1 };
    live.splice(upperIndex + 1, 1);
    applyBlocks(live, { id: upper.id, position: merged.offset });
  }

  /* Delete a selection that runs across blocks, joining the first and last block. */
  /* Typed or pasted text replaces the selection. Returns false when the selection is inside one block. */
  function deleteAcross(text = '') {
    const current = window.getSelection();

    /* A copy of the selection, because the browser may move the real selection while the blocks are edited. */
    const range = current?.rangeCount ? current.getRangeAt(0).cloneRange() : null;
    const live = liveBlocks();
    const touched = range ? live.filter(block => {
      const element = elements.current.get(block.id);
      return element && range.intersectsNode(element);
    }) : [];
    if (!range || range.collapsed || touched.length < 2) return false;

    const first = touched[0];
    const last = touched[touched.length - 1];
    const firstElement = elements.current.get(first.id) as HTMLElement;
    const lastElement = elements.current.get(last.id) as HTMLElement;

    /* Page blocks in the selection are kept: they go back where the selection started. */
    const pages = bodyRef.current ? pageBlocksIn(range, bodyRef.current) : [];

    /* Remove the selected text from the end of the first block, then add any replacement text. */
    const tail = document.createRange();
    if (firstElement.contains(range.startContainer)) tail.setStart(range.startContainer, range.startOffset);
    else tail.setStart(firstElement, 0);
    tail.setEnd(firstElement, firstElement.childNodes.length);
    tail.deleteContents();
    if (!firstElement.firstElementChild && !firstElement.textContent) {
      tail.selectNodeContents(firstElement.appendChild(document.createElement('p')));
    }

    /* Typed text and kept page blocks go exactly where the selection started, inside that line's text. */
    /* (After deleting, the browser puts the range after the line, so it cannot be used for this.) */
    const insertAt = document.createRange();
    if (firstElement.contains(range.startContainer)) insertAt.setStart(range.startContainer, range.startOffset);
    else insertAt.setStart(tail.startContainer, tail.startOffset);

    /* The caret goes after any typed text, before the kept page blocks (as in continuous mode). */
    const caretOffset = getLength(firstElement) + text.length;
    const kept = document.createDocumentFragment();
    if (text) kept.append(document.createTextNode(text));
    pages.forEach(page => {
      page.replaceChildren();
      kept.append(page, document.createTextNode(' '));
    });
    if (kept.childNodes.length) insertAt.insertNode(kept);

    /* Draw the kept blocks again now, so the caret position counted below matches the redrawn note. */
    hydratePages(firstElement);

    /* Remove the selected text from the start of the last block. */
    const head = document.createRange();
    head.setStart(lastElement, 0);
    if (lastElement.contains(range.endContainer)) head.setEnd(range.endContainer, range.endOffset);
    else head.setEnd(lastElement, lastElement.childNodes.length);
    head.deleteContents();

    const merged = mergeContents(firstElement, lastElement);
    const startIndex = live.indexOf(first);
    live.splice(startIndex, live.indexOf(last) - startIndex + 1, { ...first, html: merged.html, version: first.version + 1 });
    applyBlocks(live, { id: first.id, position: pages.length ? caretOffset : merged.offset });
    return true;
  }

  /* Shift + Enter adds a line break inside the same block. */
  function insertLineBreak(editable: HTMLElement) {
    const current = window.getSelection();
    if (!current?.rangeCount || !selectionInside(editable)) return;
    const range = current.getRangeAt(0);
    range.deleteContents();
    const lineBreak = document.createElement('br');
    range.insertNode(lineBreak);
    range.setStartAfter(lineBreak);
    range.collapse(true);

    /* Browsers need a second <br> to show a caret after a trailing line break. */
    if (!lineBreak.nextSibling) lineBreak.after(document.createElement('br'));
    current.removeAllRanges();
    current.addRange(range);
  }

  /* New lines added inside one block (by a slash command, toggle or table) become blocks of their own. */
  /* The element that should get the caret is marked with data-caret while the block is re-read. */
  /* offset: the caret's exact place in that element, when it is not at its start or end. */
  function splitLines(focus: HTMLElement | null, atEnd: boolean, offset?: number) {
    focus?.setAttribute('data-caret', '');
    const live = liveBlocks();
    const index = live.findIndex(block => block.id === (blockIdOf(focus) ?? selectionRef.current.activeId));
    focus?.removeAttribute('data-caret');
    if (index < 0) {
      commitTyping();
      return;
    }

    const parts = parseBlocks(live[index].html).map(part => ({ ...part, group: live[index].group }));
    const target = parts.find(part => part.html.includes('data-caret'));
    const cleaned = parts.map(part => ({ ...part, html: part.html.replace(/ data-caret=""/g, '') }));
    live.splice(index, 1, ...cleaned);
    const position = offset ?? (atEnd ? 'end' : 'start');
    if (!target) {
      applyBlocks(live, { id: cleaned[cleaned.length - 1].id, position });
      return;
    }

    /* Find the marked element's place inside its new block, so the caret can return to it. */
    const holder = document.createElement('div');
    holder.innerHTML = target.html;
    const path = Array.from(holder.querySelectorAll('*')).findIndex(element => element.hasAttribute('data-caret'));
    applyBlocks(live, { id: cleaned[parts.indexOf(target)].id, position, path: path >= 0 ? path : undefined });
  }

  /* The first Ctrl + A selects the current block; pressing it again selects the whole note. */
  function selectAll(wholeNote = false) {
    const body = bodyRef.current;
    const current = window.getSelection();
    if (!body || !current) return;
    const editable = closestAtCaret('.block-content');
    const range = current.rangeCount ? current.getRangeAt(0) : null;
    const wholeBlock = Boolean(editable && range && !range.collapsed && range.toString() === editable.textContent);

    body.focus({ preventScroll: true });
    if (!wholeNote && editable && body.contains(editable) && !wholeBlock && editable.textContent) {
      selectContents(editable);
      return;
    }
    const list = blocksRef.current.map(block => elements.current.get(block.id)).filter((element): element is HTMLDivElement => Boolean(element));
    if (!list.length) return;
    const all = document.createRange();
    all.setStart(list[0], 0);
    all.setEnd(list[list.length - 1], list[list.length - 1].childNodes.length);
    current.removeAllRanges();
    current.addRange(all);
  }


  /* =========================
     Session and Page Events
     ========================= */

  /* Register this editor's actions with the session (Sticky button, Ctrl+A, code language changes). */
  useEffect(() => {
    session.setAdapter({
      commit: commitTyping,
      selectAll,
      toggleSticky() {
        if (locked) return;
        const live = liveBlocks();
        const ids = targetIds();
        const state = stickyStateFor(live, ids);
        if (state === 'none') return;
        const group = live.find(block => block.id === ids[0])?.group ?? null;
        applyBlocks(state === 'unstick' && group ? unstickGroup(live, group) : stickBlocks(live, ids), null);
      },
      linesChanged: splitLines
    });
    return () => session.setAdapter(null);
  });

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;

    /* Native beforeinput: React's version does not report the input type needed for undo. */
    /* Edits that would cross block boundaries are handled here instead of by the browser. */
    function handleBeforeInput(event: InputEvent) {
      if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
        event.preventDefault();
        if (event.inputType === 'historyUndo') session.undo();
        else session.redo();
        return;
      }
      const changesText = event.inputType.startsWith('insert') || event.inputType.startsWith('delete');
      if (changesText && deleteAcross(event.inputType === 'insertText' ? event.data ?? '' : '')) {
        event.preventDefault();
        return;
      }

      /* Never let text be typed outside a block, for example between two blocks. */
      if (changesText && !closestAtCaret('.block-content')) {
        event.preventDefault();
        return;
      }
      session.beforeInput(event);
    }

    /* Work out which blocks the selection touches, for highlighting and the Sticky button. */
    function handleSelectionChange() {
      const current = window.getSelection();
      if (!body || !current?.rangeCount) return;
      const range = current.getRangeAt(0);

      if (!body.contains(range.commonAncestorContainer)) {
        if (document.activeElement?.matches('input, textarea, select')) setSelection(NO_SELECTION);
        return;
      }
      const picked = range.collapsed ? [] : blocksRef.current.filter(block => {
        const element = elements.current.get(block.id);
        return element && range.intersectsNode(element);
      }).map(block => block.id);
      const next = { activeId: blockIdOf(current.focusNode), picked, collapsed: range.collapsed };
      setSelection(previous => (previous.activeId === next.activeId && previous.collapsed === next.collapsed
        && previous.picked.join() === next.picked.join() ? previous : next));
    }

    /* Dragging can drop anywhere on the page: the nearest gap is chosen from the pointer height. */
    /* A whole sticky group can only be dropped between other blocks and groups, never inside a group. */
    function dropSlot(clientY: number) {
      const dragged = draggedIds.current;
      const others = blocksRef.current.filter(block => !dragged.includes(block.id));
      const rowBounds = (id: string) => body?.querySelector(`[data-block-id="${id}"]`)?.getBoundingClientRect();

      let slot = others.length;
      for (let index = 0; index < others.length; index += 1) {
        const block = others[index];
        const startsUnit = dragged.length === 1 || !block.group || others[index - 1]?.group !== block.group;
        if (!startsUnit) continue;

        let end = index;
        if (dragged.length > 1 && block.group) {
          while (others[end + 1]?.group === block.group) end += 1;
        }
        const top = rowBounds(block.id)?.top ?? 0;
        const bottom = rowBounds(others[end].id)?.bottom ?? 0;
        if (clientY < (top + bottom) / 2) {
          slot = index;
          break;
        }
      }
      return { others, slot };
    }

    function handleDragOver(event: globalThis.DragEvent) {
      if (!draggedIds.current.length) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      const { others, slot } = dropSlot(event.clientY);
      const mark: DropMark | null = slot < others.length ? { id: others[slot].id, side: 'before' }
        : others.length ? { id: others[others.length - 1].id, side: 'after' } : null;
      setDropMark(current => (current?.id === mark?.id && current?.side === mark?.side ? current : mark));
    }

    /* A single dropped block joins a sticky group only when both neighbours of the gap belong to it. */
    function handleDrop(event: globalThis.DragEvent) {
      const ids = draggedIds.current;
      if (!ids.length) return;
      event.preventDefault();
      const { slot } = dropSlot(event.clientY);
      handleDragEnd();

      const live = liveBlocks();
      let moving = live.filter(block => ids.includes(block.id));
      const others = live.filter(block => !ids.includes(block.id));
      if (moving.length === 1) {
        const before = others[slot - 1];
        const after = others[slot];
        const group = before?.group && before.group === after?.group ? before.group : null;
        moving = [{ ...moving[0], group }];
      }
      others.splice(slot, 0, ...moving);
      applyBlocks(others, { id: moving[0].id, position: 'end' });
    }

    function handleDragEnd() {
      draggedIds.current = [];
      setDraggingIds([]);
      setDropMark(null);
    }

    body.addEventListener('beforeinput', handleBeforeInput);
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);
    document.addEventListener('dragend', handleDragEnd);
    return () => {
      body.removeEventListener('beforeinput', handleBeforeInput);
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
      document.removeEventListener('dragend', handleDragEnd);
    };
  });

  /* Stable callbacks for the block rows, which always call the latest version of each action. */
  const actions = useRef({ addBlock, startDrag });
  actions.current = { addBlock, startDrag };
  const onAdd = useCallback((id: string, position: 'above' | 'below') => actions.current.addBlock(id, position), []);
  const onDragStart = useCallback((id: string, event: DragEvent<HTMLButtonElement>) => actions.current.startDrag(id, event), []);

  function startDrag(id: string, event: DragEvent<HTMLButtonElement>) {
    if (locked) {
      event.preventDefault();
      return;
    }
    const ids = unitFor(id);
    draggedIds.current = ids;
    setDraggingIds(ids);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', '');
  }


  /* =========================
     Keyboard, Mouse and Typing
     ========================= */

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const native = event.nativeEvent;
    if (native.isComposing) return;
    const command = event.ctrlKey || event.metaKey;

    if (command && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      selectAll();
      return;
    }
    if (locked) return;

    const editable = closestAtCaret('.block-content');
    const id = blockIdOf(editable);

    if (event.altKey && !command && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && id) {
      event.preventDefault();
      moveUnit(unitFor(id), event.key === 'ArrowUp' ? -1 : 1);
      return;
    }

    /* A selection that would break a tab block is left alone (see breaksTabBlock). */
    const selected = window.getSelection()?.rangeCount ? window.getSelection()?.getRangeAt(0) : null;
    const deleting = event.key === 'Backspace' || event.key === 'Delete' || event.key === 'Enter';
    if (deleting && selected && bodyRef.current && breaksTabBlock(selected, bodyRef.current)) {
      event.preventDefault();
      return;
    }

    /* A selection across blocks is deleted as one edit (typing is handled in beforeinput). */
    if (deleting && deleteAcross()) {
      event.preventDefault();
      return;
    }
    if (!editable || !id || !bodyRef.current?.contains(editable)) return;

    /* A web address typed just before Space or Enter becomes a link first. */
    if ((event.key === ' ' || event.key === 'Enter') && !event.altKey && !event.ctrlKey && !event.metaKey) linkTypedAddress(editable);

    /* Tab, Enter and Backspace work differently inside table cells and toggle lists. */
    const result = handleBlockKeys(native, editable);
    if (result) {
      if (result.kind === 'blocked') return;
      session.checkpoint();
      if (result.kind === 'lines') splitLines(result.focus, result.atEnd);
      else commitTyping();
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      handleDeletion(event, editable, id);
      return;
    }

    /* In code, Enter adds a code line; Shift + Enter leaves the code with a new block below. */
    const pre = preAtCaret(editable);
    if (pre && event.key === 'Enter' && !event.altKey) {
      event.preventDefault();
      if (event.shiftKey || command) {
        addBlock(id, 'below');
      } else {
        session.checkpoint();
        insertNewline(pre);
        commitTyping();
      }
      return;
    }

    /* Expand Markdown markers such as # or - typed at the start of an empty line. */
    if (applyMarkdownShortcut(native, editable)) {
      session.checkpoint();
      commitTyping();
      return;
    }

    if (event.key !== 'Enter' || event.altKey || command) return;

    if (event.shiftKey) {
      event.preventDefault();
      session.checkpoint();
      insertLineBreak(editable);
      commitTyping();
      return;
    }

    /* Lines inside a toggle list or a tab stay in the toggle's or tab block's block. */
    if (closestAtCaret('.toggle-body, .tab-panel')) return;

    /* Lists keep the browser's normal Enter, so new items stay in the same list block. */
    const item = closestAtCaret('li');
    if (item && editable.contains(item)) {
      if (item.textContent !== '' || item.nextElementSibling) return;
      event.preventDefault();
      exitList(item, editable, id);
      return;
    }

    event.preventDefault();
    splitBlock(editable, id);
  }

  function handleInput(event: FormEvent<HTMLDivElement>) {
    if ((event.nativeEvent as InputEvent).isComposing) return;
    const editable = closestAtCaret('.block-content');

    /* Re-colour code first so the saved content includes the updated tokens. */
    const pre = editable ? preAtCaret(editable) : null;
    if (pre) highlight(pre);
    else if (editable) wrapLooseLines(editable);
    commitTyping();
    if (editable && joinTypedDashes(event.nativeEvent as InputEvent, editable, () => session.checkpoint())) commitTyping();
  }

  /* Paste plain text only, so external HTML cannot bring in styles or scripts. Markdown in the */
  /* text (links, bold, lists, headings and so on) is formatted, except when pasting into code. */
  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    if (locked) return;

    /* A copied picture (or picture file) is added as an image. */
    const images = imageFiles(event.clipboardData);
    const block = closestAtCaret('.block-content');
    if (images.length && !(block && preAtCaret(block))) {
      insertImageFiles(session, images);
      return;
    }
    session.checkpoint();
    const text = event.clipboardData.getData('text/plain');
    const start = closestAtCaret('.block-content');
    const inCode = Boolean(start && preAtCaret(start));
    const lines = inCode ? null : pastedMarkdown(pastedSource(event.clipboardData), event.clipboardData.getData('text/html'));

    /* In a table, copied cells go in cell by cell (see tableClipboard.ts). */
    if (!inCode && bodyRef.current && pasteIntoTable(event.clipboardData, bodyRef.current, lines)) {
      commitTyping();
      return;
    }
    if (lines) {
      pasteLines(withCopiedTables(lines, event.clipboardData));
      return;
    }
    if (deleteAcross(text)) return;

    const editable = closestAtCaret('.block-content');
    if (!editable) return;

    /* Pasting over a selection that holds page blocks keeps the blocks. */
    const selected = window.getSelection()?.rangeCount ? window.getSelection()?.getRangeAt(0) : null;
    if (selected && !selected.collapsed && deleteKeepingPages(selected, editable, text)) {
      commitTyping();
      return;
    }
    const pre = preAtCaret(editable);
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
      commitTyping();
    }
  }

  /* Pasted Markdown lines go where the selection starts. A selection across blocks is deleted first, */
  /* drawn at once (flushSync) so the caret is in the joined block; new lines then become blocks. */
  function pasteLines(lines: HTMLElement[]) {
    const deleted = flushSync(() => deleteAcross());
    const editable = closestAtCaret('.block-content');
    if (!editable) return;
    deleteSelection(editable);
    const pasted = insertPasted(editable, lines);
    continuingEdit.current = deleted;
    try {
      if (pasted?.added) splitLines(pasted.line, true, getOffset(pasted.line) ?? undefined);
      else commitTyping();
    } finally {
      continuingEdit.current = false;
    }
  }

  /* Copying keeps the kind of each line (see clipboard.ts), so pasting into a note brings it back. */
  function handleCopy(event: ClipboardEvent<HTMLDivElement>) {
    const body = bodyRef.current;
    if (body) writeSelection(event.nativeEvent, body);
  }

  /* Cutting copies the same way, then removes the selection: across blocks as one edit, inside */
  /* one block as an ordinary deletion. */
  function handleCut(event: ClipboardEvent<HTMLDivElement>) {
    const body = bodyRef.current;
    if (!body || locked) {
      event.preventDefault();
      return;
    }
    if (!writeSelection(event.nativeEvent, body)) return;

    /* Cut table cells are emptied, keeping the table's shape. */
    if (clearSelectedCells(body)) commitTyping();
    else if (selectionRef.current.picked.length >= 2) deleteAcross();
    else document.execCommand('delete');
  }

  /* Double-clicking the side of a sticky group selects the text of every block in it. */
  function handleDoubleClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest('.block-content, .block-controls')) return;
    const groupId = target.closest<HTMLElement>('.sticky-group')?.dataset.groupId;
    const ids = blocksRef.current.filter(block => block.group === groupId).map(block => block.id);
    const first = elements.current.get(ids[0]);
    const last = elements.current.get(ids[ids.length - 1]);
    if (!groupId || !first || !last) return;
    event.preventDefault();

    const range = document.createRange();
    range.setStart(first, 0);
    range.setEnd(last, last.childNodes.length);
    bodyRef.current?.focus({ preventScroll: true });
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }


  /* =========================
     Rendering
     ========================= */

  /* Groups show their brackets while their text is selected or while they are being dragged. */
  const revealedGroups = new Set(blocks
    .filter(block => block.group && (draggingIds.includes(block.id) || (!selection.collapsed && selection.picked.includes(block.id))))
    .map(block => block.group as string));

  const renderRow = (block: DocBlock) => (
    <BlockRow
      key={block.id}
      block={block}
      selected={block.id === selection.activeId}
      ranged={block.id === selection.activeId && !selection.collapsed}
      picked={selection.picked.length > 1 && selection.picked.includes(block.id)}
      dragging={draggingIds.includes(block.id)}
      drop={dropMark?.id === block.id ? dropMark.side : null}
      register={register}
      onAdd={onAdd}
      onDragStart={onDragStart}
    />
  );

  /* Consecutive blocks in the same group are wrapped together in one sticky-group element. */
  const rows: ReactNode[] = [];
  blocks.forEach((block, index) => {
    if (!block.group) {
      rows.push(renderRow(block));
    } else if (blocks[index - 1]?.group !== block.group) {
      const members = [];
      for (let next = index; blocks[next]?.group === block.group; next += 1) members.push(blocks[next]);
      rows.push(
        <div key={block.group} className={`sticky-group ${revealedGroups.has(block.group) ? 'is-revealed' : ''}`} data-group-id={block.group}>
          {members.map(renderRow)}
        </div>
      );
    }
  });

  return (
    <div
      ref={bodyRef}
      className={`note-body structured-document ${locked ? 'is-locked' : ''}`}
      contentEditable={!locked}
      suppressContentEditableWarning
      tabIndex={-1}
      role="textbox"
      aria-multiline="true"
      aria-label="Document content, blocks"
      aria-readonly={locked}
      onKeyDown={handleKeyDown}
      onInput={handleInput}
      onPaste={handlePaste}
      onCopy={handleCopy}
      onCut={handleCut}
      onDoubleClick={handleDoubleClick}
    >
      {rows}
    </div>
  );
}, (previous, next) => previous.session === next.session && previous.locked === next.locked);
