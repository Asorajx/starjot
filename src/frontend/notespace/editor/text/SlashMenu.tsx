import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { Icon } from '../../../components/Icon';
import { canAddSubpage, createSubpage, noteTitle, useNotes } from '../../store';
import { caretIsInlineOnly, matchCommands, type SlashCommand } from './slashCommands';
import { convertLine, createPageBlock, createPageMention, createTable, insertBlock, insertInline, lineAtCaret, type LineChange } from './lines';
import { hydratePages, renameSubNote } from './pageBlocks';
import { getPreferences } from '../../../app/preferences';
import { closestAtCaret } from './dom';
import type { EditorSession } from '../session';

type SlashMenuProps = {
  session: EditorSession;
  noteId: string;
  locked: boolean;

  /* Called after a new sub-page is added, so it can be opened and named straight away. With */
  /* Settings → Notes → Open new sub-notes off, it is named in this note instead. */
  onOpenNewPage: (id: string) => void;
};

/* Where the "/" was typed: its text node and its position in that node. */
type Anchor = { node: Text; offset: number };

/* commands: choosing a block type. pages: choosing the page to link to. */
type Mode = 'commands' | 'pages';

type MenuPosition = { top: number; left: number; above: boolean };

/* How many pages the "Link to note" list shows at once. */
const PAGE_RESULTS = 8;

/* The text node and offset of a collapsed caret. Browsers sometimes report the caret as a position */
/* in the line element right after the text, so that case is turned into the end of the text. */
function caretInText() {
  const selection = window.getSelection();
  let node = selection?.focusNode ?? null;
  let offset = selection?.focusOffset ?? 0;
  if (!selection?.isCollapsed || !node) return null;
  if (node.nodeType !== Node.TEXT_NODE) {
    const before = node.childNodes[offset - 1];
    if (before?.nodeType !== Node.TEXT_NODE) return null;
    node = before;
    offset = before.textContent?.length ?? 0;
  }
  return { node: node as Text, offset };
}


/* =========================
   Slash Menu
   ========================= */

/* Typing "/" at the start of a line or after a space opens a menu of blocks to add at that spot. */
/* The text typed after "/" filters the menu; Enter or a click chooses, Escape closes it. */
export function SlashMenu({ session, noteId, locked, onOpenNewPage }: SlashMenuProps) {
  const notes = useNotes();
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>('commands');
  const [active, setActive] = useState(0);
  const [search, setSearch] = useState('');

  const anchor = useRef<Anchor | null>(null);
  const lastQuery = useRef('');
  const menu = useRef<HTMLDivElement>(null);

  /* The "/" and the text after it, kept while the page search box has focus. */
  const linkRange = useRef<Range | null>(null);

  const inlineOnly = useRef(false);
  const commands = matchCommands(query, { inlineOnly: inlineOnly.current, canAddPage: canAddSubpage(noteId) });
  const pages = notes
    .filter(note => note.id !== noteId && `${note.title} ${note.subtitle}`.toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, PAGE_RESULTS);

  /* Refs give the native listeners below the latest values without re-adding them on every render. */
  const latest = useRef({ commands, active, mode, locked });
  latest.current = { commands, active, mode, locked };
  const choose = useRef<(command: SlashCommand) => void>(() => undefined);

  function close() {
    anchor.current = null;
    lastQuery.current = '';
    linkRange.current = null;
    setPosition(null);
    setMode('commands');
    setQuery('');
    setSearch('');
    setActive(0);
  }

  /* The range covering "/" and the typed filter text. */
  function commandRange() {
    const start = anchor.current;
    const caret = caretInText();
    if (!start) return null;
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    if (caret?.node === start.node) range.setEnd(start.node, Math.max(start.offset + 1, caret.offset));
    else range.setEnd(start.node, start.offset + 1);
    return range;
  }

  useEffect(() => {
    /* Keep the menu in step with the caret: close it when the "/" is deleted or the caret leaves it. */
    function update() {
      const start = anchor.current;
      if (!start || latest.current.mode === 'pages') return;
      const caret = caretInText();
      const text = start.node.textContent ?? '';
      const valid = start.node.isConnected && caret?.node === start.node && caret.offset > start.offset && text[start.offset] === '/';
      const typed = valid ? text.slice(start.offset + 1, caret.offset) : '';
      if (!valid || typed.length > 30 || /^\s|\s\s/.test(typed)) {
        close();
        return;
      }

      /* The menu opens below the "/", or above it near the bottom of the window. */
      const slash = document.createRange();
      slash.setStart(start.node, start.offset);
      slash.setEnd(start.node, start.offset + 1);
      const bounds = slash.getBoundingClientRect();
      const above = bounds.bottom + 340 > window.innerHeight && bounds.top > 340;
      setPosition({ top: above ? bounds.top - 6 : bounds.bottom + 6, left: Math.min(bounds.left, window.innerWidth - 300), above });

      /* A new filter highlights the best match again. */
      if (typed !== lastQuery.current) setActive(0);
      lastQuery.current = typed;
      setQuery(typed);
    }

    /* A "/" typed at the start of a line or after a space opens the menu. Code keeps "/" as text. */
    function handleInput(event: Event) {
      const body = session.body();
      const caret = caretInText();
      if (!anchor.current && !latest.current.locked && (event as InputEvent).data === '/' && body && caret
        && body.contains(caret.node) && !closestAtCaret('pre, code, a')) {
        const text = caret.node.textContent ?? '';
        const { offset } = caret;
        if (text[offset - 1] === '/' && (offset === 1 || /\s/.test(text[offset - 2]))) {
          anchor.current = { node: caret.node, offset: offset - 1 };
          inlineOnly.current = caretIsInlineOnly();
          setActive(0);
          setMode('commands');
        }
      }
      update();
    }

    /* While the menu is open, arrows, Enter, Tab and Escape belong to it rather than the note. */
    function handleKeyDown(event: KeyboardEvent) {
      const { commands: list, active: index, mode: current } = latest.current;
      if (!anchor.current || current !== 'commands') return;
      const handled = () => {
        event.preventDefault();
        event.stopPropagation();
      };

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        handled();
        if (list.length) setActive((index + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length);
      } else if ((event.key === 'Enter' || event.key === 'Tab') && list.length) {
        handled();
        choose.current(list[Math.min(index, list.length - 1)]);
      } else if (event.key === 'Escape') {
        handled();
        close();
      }
    }

    /* Clicking anywhere else closes the menu. */
    function handleMouseDown(event: MouseEvent) {
      if (anchor.current && !(event.target as Element).closest?.('.slash-menu')) close();
    }

    document.addEventListener('input', handleInput, true);
    document.addEventListener('selectionchange', update);
    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('input', handleInput, true);
      document.removeEventListener('selectionchange', update);
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  /* The arrow keys move the highlight past the menu's visible part, so the list follows it. */
  useEffect(() => {
    menu.current?.querySelector('.slash-menu-item.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [active, mode, position !== null]);

  /* Replace "/" and the filter text with the chosen block. */
  choose.current = (command: SlashCommand) => {
    const body = session.body();
    const range = commandRange();
    if (!body || !range) return;

    /* Linking asks which page first; the search box takes focus, so the spot is remembered. */
    if (command.id === 'link') {
      linkRange.current = range;
      setMode('pages');
      setSearch('');
      setActive(0);
      return;
    }

    close();
    session.checkpoint();

    /* A sub-page is placed right where "/" was typed, as a card inside the text. */
    if (command.id === 'page') {
      const page = createSubpage(noteId);
      if (!page) return;
      insertInline(range, createPageBlock(page.id));
      hydratePages(body);
      session.commit();
      if (getPreferences().openNewSubNotes) onOpenNewPage(page.id);
      else renameSubNote(page.id);
      return;
    }

    range.deleteContents();
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    const line = lineAtCaret(body);
    if (!line) {
      session.commit();
      return;
    }

    let change: LineChange;
    if (command.id === 'divider') change = insertBlock(line, document.createElement('hr'));
    else if (command.id === 'table') change = insertBlock(line, createTable());
    else change = convertLine(line, command.id);
    session.linesChanged(change.focus, change.atEnd);
  };

  function linkTo(id: string) {
    const range = linkRange.current;
    const body = session.body();
    close();
    if (!range || !body) return;
    body.focus({ preventScroll: true });
    session.checkpoint();
    insertInline(range, createPageMention(id));
    hydratePages(body);
    session.commit();
  }

  /* Escape in the page search returns to the note, leaving the "/" text as it was. */
  function cancelLink() {
    const range = linkRange.current;
    close();
    if (!range) return;
    session.body()?.focus({ preventScroll: true });
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (pages.length) setActive(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + pages.length) % pages.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (pages[active]) linkTo(pages[active].id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelLink();
    }
  }

  if (!position) return null;
  const style = { top: position.top, left: position.left, transform: position.above ? 'translateY(-100%)' : undefined };

  /* Keep the caret in the note while the mouse is pressed on the menu. */
  /* Items follow the mouse only when it moves, because the menu can open under a still pointer. */
  const keepFocus = (event: ReactMouseEvent) => event.preventDefault();

  return (
    <div ref={menu} className="slash-menu" style={style} role="listbox" aria-label={mode === 'pages' ? 'Choose a note to link' : 'Add a block'}>
      {mode === 'commands' && (
        <>
          <p className="slash-menu-label">{inlineOnly.current ? 'Insert' : 'Add a block'}</p>
          {commands.length ? commands.map((command, index) => (
            <button
              key={command.id}
              type="button"
              role="option"
              aria-selected={index === active}
              className={`slash-menu-item ${index === active ? 'is-active' : ''}`}
              onMouseDown={keepFocus}
              onMouseMove={() => setActive(index)}
              onClick={() => choose.current(command)}
            >
              <span className="slash-menu-icon"><Icon name={command.icon} size={15} /></span>
              <span className="slash-menu-name">{command.label}</span>
              {command.hint && <kbd>{command.hint}</kbd>}
            </button>
          )) : <p className="slash-menu-empty">No matching blocks</p>}
        </>
      )}

      {mode === 'pages' && (
        <>
          <input
            className="slash-menu-search"
            autoFocus
            placeholder="Search notes…"
            aria-label="Search notes"
            value={search}
            onChange={event => {
              setSearch(event.target.value);
              setActive(0);
            }}
            onKeyDown={handleSearchKeyDown}
            onBlur={event => {
              if (!event.relatedTarget?.closest('.slash-menu')) cancelLink();
            }}
          />
          {pages.length ? pages.map((page, index) => (
            <button
              key={page.id}
              type="button"
              role="option"
              aria-selected={index === active}
              className={`slash-menu-item ${index === active ? 'is-active' : ''}`}
              onMouseDown={keepFocus}
              onMouseMove={() => setActive(index)}
              onClick={() => linkTo(page.id)}
            >
              <span className="slash-menu-icon">{page.icon || <Icon name="file-text" size={15} />}</span>
              <span className="slash-menu-name">{noteTitle(page)}</span>
            </button>
          )) : <p className="slash-menu-empty">No notes found</p>}
        </>
      )}
    </div>
  );
}
