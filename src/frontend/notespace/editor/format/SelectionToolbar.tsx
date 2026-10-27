import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { RECENT_COLORS, getPreferences, updatePreferences, usePreferences } from '../../../app/preferences';
import { Icon, type IconName } from '../../../components/Icon';
import { COLOR_NAMES, applyColor, colorAt, type ColorClass, type ColorKind, type ColorName } from './colors';
import type { EditorSession } from '../session';
import { useEscape } from '../../../lib/useDismiss';
import { changeLinesType, LINE_TYPES, linesInRange, typeOfLine, type LineType } from './lineTypes';
import { elementOf } from '../../../lib/nodes';
import { showToast } from '../../../lib/toasts';
import { getNote, noteTitle } from '../../store';
import { copyPageLink, linkSelection, setLinkTarget, unwrapLink, type LinkTarget } from '../links/links';
import { LinkPicker } from '../links/LinkPicker';
import { isLinkShortcut } from '../../../app/shortcuts';
import { blockWords, linkableBlock, linkIdOf } from '../links/blockLinks';

type SelectionToolbarProps = {
  session: EditorSession;
  locked: boolean;
};

type Box = { top: number; bottom: number; left: number; right: number };
type Size = { width: number; height: number };

/* The selection's outline, and the spot where the selection ends (where the mouse was released). */
type Anchor = { selection: Box; end: Box; kind: string };
type Mode = 'buttons' | 'link' | 'comment' | 'color';

/* How the Turn into list was opened: by resting the pointer on the kind (it closes when the */
/* pointer leaves), or by a click or key (it takes focus and stays until a choice or Escape). */
type TypesOpen = 'hover' | 'keys' | null;

/* The list opens beside the bar (right, or left near the window's edge), or below the kind */
/* when neither side has room. */
type TypesSide = 'right' | 'left' | 'below';

/* The pause before the list opens on hover, and the grace period for moving into it. */
const HOVER_OPEN = 150;
const HOVER_CLOSE = 250;

/* The editor's top bar covers this much of the window, so the toolbar never goes above it. */
const TOP_LIMIT = 64;
const GAP = 8;

/* A link in the note: an address link or a page link (which has no address). */
const LINK = 'a[href], a.page-link';

/* The address a link made across several lines gets for a moment, before it is pointed at its */
/* target (see applyLink). */
const NEW_LINK = 'https://starjot.invalid/new-link';

const FORMATS: { command: string; icon: IconName; label: string; shortcut?: string }[] = [
  { command: 'bold', icon: 'bold', label: 'Bold', shortcut: 'Ctrl + B' },
  { command: 'italic', icon: 'italic', label: 'Italic', shortcut: 'Ctrl + I' },
  { command: 'underline', icon: 'underline', label: 'Underline', shortcut: 'Ctrl + U' },
  { command: 'strikeThrough', icon: 'strikethrough', label: 'Strikethrough' }
];

/* Whether the selected text already has a format (all of it bold, say), so its button shows as on. */
function formatIsOn(command: string) {
  try {
    return document.queryCommandState(command);
  } catch {
    return false;
  }
}


/* =========================
   Toolbar Position
   ========================= */

/* Above the selection when there is room; otherwise below it; and when the selection fills the */
/* window, next to the end where the mouse was released. The result is always kept inside the */
/* window, so a selection near an edge can no longer push the bar off screen. */
export function placeToolbar(anchor: Pick<Anchor, 'selection' | 'end'>, size: Size, view: Size) {
  const { selection, end } = anchor;
  const fitsAbove = (box: Box) => box.top - size.height - GAP >= TOP_LIMIT;
  const fitsBelow = (box: Box) => box.bottom + GAP + size.height <= view.height - GAP;

  let top = selection.bottom + GAP;
  let center = (selection.left + selection.right) / 2;
  if (fitsAbove(selection)) top = selection.top - size.height - GAP;
  else if (!fitsBelow(selection)) {
    top = fitsAbove(end) ? end.top - size.height - GAP : end.bottom + GAP;
    center = end.left;
  }

  return {
    top: Math.min(Math.max(top, TOP_LIMIT), view.height - size.height - GAP),
    left: Math.min(Math.max(center, size.width / 2 + GAP), view.width - size.width / 2 - GAP)
  };
}

/* The screen position of the end of the selection, or null when the browser cannot measure it. */
function selectionEnd(selection: Selection): Box | null {
  if (!selection.focusNode) return null;
  const range = document.createRange();
  range.setStart(selection.focusNode, selection.focusOffset);
  const box = range.getClientRects()[0] ?? range.getBoundingClientRect();
  return box.top || box.bottom || box.left ? box : null;
}


/* =========================
   Kind of Text
   ========================= */

/* What a line is called, checked from the most specific kind to plain text. */
const KINDS: [string, string][] = [
  ['pre', 'Code'],
  ['td, th', 'Table'],
  ['h1', 'Heading 1'],
  ['h2', 'Heading 2'],
  ['h3', 'Heading 3'],
  ['h4', 'Heading 4'],
  ['h5', 'Heading 5'],
  ['.toggle-summary', 'Toggle'],
  ['ol > li', 'Numbered list'],
  ['ul > li', 'Bulleted list'],
  ['blockquote', 'Quote']
];

const LINES = 'p, h1, h2, h3, h4, h5, h6, li, pre, td, th';

function kindOf(node: Node, root: Element) {
  const element = elementOf(node);
  const found = KINDS.find(([selector]) => {
    const match = element?.closest(selector);
    return Boolean(match && root.contains(match));
  });
  const heading = element?.closest('.toggle-summary')?.tagName.match(/^H([1-5])$/);
  if (found?.[1] === 'Toggle' || (heading && found?.[1].startsWith('Heading'))) return heading ? `Toggle heading ${heading[1]}` : 'Toggle';
  return found?.[1] ?? 'Text';
}

/* What kind of text is selected ("Text", "Heading 2", "Bulleted list"…), or "Mixed" when the */
/* selection covers lines of different kinds. */
export function selectionKind(range: Range, root: Element) {
  const kinds = new Set([kindOf(range.startContainer, root), kindOf(range.endContainer, root)]);
  root.querySelectorAll(LINES).forEach(line => {
    if (kinds.size < 2 && range.intersectsNode(line) && line.textContent?.trim()) kinds.add(kindOf(line, root));
  });
  return kinds.size === 1 ? [...kinds][0] : 'Mixed';
}


/* =========================
   Colour Palette
   ========================= */

const COLOR_LABELS: Record<ColorName, string> = {
  gray: 'Gray', brown: 'Brown', orange: 'Orange', yellow: 'Yellow', green: 'Green', blue: 'Blue', purple: 'Purple', pink: 'Pink', red: 'Red'
};

type SwatchProps = {
  kind: ColorKind;
  name: ColorName | null;
  chosen: boolean;
  onPick: () => void;
};

/* One colour to pick: an "A" in the text colour, or on the background colour. No colour shows */
/* the default. */
function Swatch({ kind, name, chosen, onPick }: SwatchProps) {
  const label = `${name ? COLOR_LABELS[name] : 'Default'} ${kind === 'text' ? 'text' : 'background'}`;
  return (
    <button
      type="button"
      className={`color-swatch is-${kind} ${name ? `${kind}-${name}` : 'is-default'} ${chosen ? 'is-chosen' : ''}`}
      aria-label={label}
      aria-pressed={chosen}
      data-tooltip={label}
      onMouseDown={event => event.preventDefault()}
      onClick={onPick}
    >
      A
    </button>
  );
}

type ColorPaletteProps = {
  current: { text: string | null; bg: string | null };
  onPick: (kind: ColorKind, name: ColorName | null) => void;
};

/* Recently used colours, then the text colours and the background colours. */
function ColorPalette({ current, onPick }: ColorPaletteProps) {
  const { recentColors } = usePreferences();
  const options = (kind: ColorKind) => [null, ...COLOR_NAMES].map(name => (
    <Swatch key={name ?? 'default'} kind={kind} name={name} chosen={(current[kind] ?? null) === (name ? `${kind}-${name}` : null)} onPick={() => onPick(kind, name)} />
  ));
  return (
    <div className="color-palette">
      {recentColors.length > 0 && (
        <>
          <span className="color-palette-heading">Recently used</span>
          <div className="color-palette-grid">
            {recentColors.map(color => {
              const [kind, name] = color.split('-') as [ColorKind, ColorName];
              return <Swatch key={color} kind={kind} name={name} chosen={current[kind] === color} onPick={() => onPick(kind, name)} />;
            })}
          </div>
        </>
      )}
      <span className="color-palette-heading">Text color</span>
      <div className="color-palette-grid">{options('text')}</div>
      <span className="color-palette-heading">Background color</span>
      <div className="color-palette-grid">{options('bg')}</div>
    </div>
  );
}

/* Put a colour first in the recently used list (the default colours are not listed). */
function rememberColor(color: ColorClass) {
  const recent = getPreferences().recentColors.filter(item => item !== color);
  updatePreferences({ recentColors: [color, ...recent].slice(0, RECENT_COLORS) });
}


/* =========================
   Selection Toolbar
   ========================= */

/* A small bar that appears above selected note text: what kind of text it is (on top; click it */
/* to turn the selected lines into another kind), then formatting, links and comments. A format */
/* the selection already has shows as on. */
/* It uses fixed positioning, so it lines up with the selection at any note zoom level. */
export function SelectionToolbar({ session, locked }: SelectionToolbarProps) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [mode, setMode] = useState<Mode>('buttons');
  const [value, setValue] = useState('');

  /* The bar's own size, measured after it is drawn; the comment box makes it taller. */
  const [size, setSize] = useState<Size>({ width: 280, height: 40 });
  const barRef = useRef<HTMLDivElement>(null);

  /* The selection is remembered, because typing a link or comment moves focus into this bar. */
  const savedRange = useRef<Range | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  /* Bumped after a format is applied, so the buttons show the new state straight away. */
  const [, setFormatted] = useState(0);
  const typesRef = useRef<HTMLDivElement>(null);
  const kindRef = useRef<HTMLButtonElement>(null);
  const [typesOpen, setTypesOpen] = useState<TypesOpen>(null);
  const [typesSide, setTypesSide] = useState<TypesSide>('right');
  const typesOpenRef = useRef<TypesOpen>(null);
  typesOpenRef.current = typesOpen;
  const hoverTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    /* Show the bar for a non-empty selection inside the note; hide it otherwise. */
    function update() {
      if (modeRef.current !== 'buttons' || typesOpenRef.current === 'keys') return;
      const selection = window.getSelection();
      const body = session.body();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      if (!body || !range || range.collapsed || !body.contains(range.commonAncestorContainer) || !range.toString().trim()) {
        setAnchor(null);
        return;
      }
      savedRange.current = range.cloneRange();
      const bounds = range.getBoundingClientRect();
      setAnchor({ selection: bounds, end: selectionEnd(selection as Selection) ?? bounds, kind: selectionKind(range, body) });
    }

    /* Clicking anywhere outside the bar cancels an unfinished link or comment. */
    function handleMouseDown(event: globalThis.MouseEvent) {
      if (modeRef.current === 'buttons' || (event.target as Element).closest?.('.selection-toolbar')) return;
      modeRef.current = 'buttons';
      setMode('buttons');
      setValue('');
    }

    /* Ctrl + K with words selected in the note (not inside one link, which LinkTools edits) opens */
    /* Add link for them, before the app's search sees the key. */
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (!isLinkShortcut(event) || lockedRef.current || modeRef.current !== 'buttons') return;
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const body = session.body();
      if (!body || !range || range.collapsed || !range.toString().trim() || !body.contains(range.commonAncestorContainer)) return;
      if (elementOf(range.commonAncestorContainer)?.closest(LINK)) return;
      event.preventDefault();
      event.stopPropagation();
      update();
      modeRef.current = 'link';
      setMode('link');
    }

    const scroller = session.scroller();
    document.addEventListener('selectionchange', update);
    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown, true);
    scroller?.addEventListener('scroll', update);
    return () => {
      document.removeEventListener('selectionchange', update);
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown, true);
      scroller?.removeEventListener('scroll', update);
    };
  }, []);

  /* Escape closes the colours and goes back to the buttons. */
  useEscape(mode === 'color', () => {
    modeRef.current = 'buttons';
    setMode('buttons');
  });

  /* Escape closes the Turn into list (giving the note its selection back if the list had focus). */
  useEscape(typesOpen !== null, () => closeTypes(true));

  /* Opened from a click or key, the list takes focus on the current kind (or the first). */
  useEffect(() => {
    if (typesOpen !== 'keys') return;
    const list = typesRef.current;
    (list?.querySelector<HTMLElement>('[aria-checked="true"]') ?? list?.querySelector<HTMLElement>('[role="menuitemradio"]'))?.focus();
  }, [typesOpen]);

  /* Pick the side with room each time the list opens. */
  useLayoutEffect(() => {
    if (!typesOpen) return;
    const bar = barRef.current?.getBoundingClientRect();
    const width = typesRef.current?.offsetWidth ?? 0;
    if (!bar) return;
    if (bar.right + GAP + width <= window.innerWidth - GAP) setTypesSide('right');
    else if (bar.left - GAP - width >= GAP) setTypesSide('left');
    else setTypesSide('below');
  }, [typesOpen]);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  /* The list closes when the selection goes away. */
  useEffect(() => {
    if (!anchor) setTypesOpen(null);
  }, [anchor]);

  /* Re-measure whenever the bar changes shape, such as opening the comment box. */
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const { width, height } = bar.getBoundingClientRect();
    setSize(current => (current.width === width && current.height === height ? current : { width, height }));
  });

  if (!anchor) return null;
  const position = placeToolbar(anchor, size, { width: window.innerWidth, height: window.innerHeight });

  /* The selected lines whose kind can be changed (none in a table cell or a toggle's title), and */
  /* their kind when they all share one. */
  const body = session.body();
  const lines = !locked && body && savedRange.current ? linesInRange(savedRange.current, body) : null;
  const lineKinds = new Set(lines?.map(typeOfLine));
  const lineKind = lineKinds.size === 1 ? [...lineKinds][0] : null;
  const linkNode = savedRange.current?.commonAncestorContainer;
  const inLink = Boolean(elementOf(linkNode)?.closest(LINK));

  /* Put the remembered selection back, so a command applies to the text that was selected. */
  function restoreSelection() {
    const range = savedRange.current;
    if (!range) return;
    const host = elementOf(range.startContainer)
      ?.closest<HTMLElement>('[contenteditable="true"]');
    host?.focus({ preventScroll: true });
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }

  function close() {
    setMode('buttons');
    setValue('');
    setAnchor(null);
  }

  function openTypes(how: Exclude<TypesOpen, null>) {
    window.clearTimeout(hoverTimer.current);
    if (how === 'hover' && typesOpen) return;
    setTypesOpen(how);
  }

  /* Close the list; with focus in it, focus goes back to the note's selection (or the kind). */
  function closeTypes(refocus = false) {
    window.clearTimeout(hoverTimer.current);
    const hadFocus = typesOpenRef.current === 'keys';
    setTypesOpen(null);
    if (!hadFocus || !refocus) return;
    restoreSelection();
  }

  /* Resting the pointer on the kind opens the list after a moment; leaving the kind and the list */
  /* closes it after a short grace, so the pointer can travel from one to the other. */
  function hoverKind(entering: boolean) {
    window.clearTimeout(hoverTimer.current);
    if (entering) {
      if (!typesOpen) hoverTimer.current = window.setTimeout(() => setTypesOpen(open => open ?? 'hover'), HOVER_OPEN);
    } else if (typesOpenRef.current === 'hover') {
      hoverTimer.current = window.setTimeout(() => setTypesOpen(open => (open === 'hover' ? null : open)), HOVER_CLOSE);
    }
  }

  /* → (or Enter, Space or ↓) on the kind opens the list with focus; ← in the list goes back. */
  function handleKindKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowRight', 'ArrowDown', 'Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    openTypes('keys');
  }

  function handleTypesKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft') return;
    event.preventDefault();
    setTypesOpen(null);
    kindRef.current?.focus();
  }

  /* Copy a link to the block the selection starts in (giving it a link id the first time, which */
  /* is saved with the note). Pasted into a note it makes a link that leads to this block. */
  async function copyBlockLink() {
    const body = session.body();
    const range = window.getSelection()?.rangeCount ? window.getSelection()?.getRangeAt(0) : null;
    const block = body && range ? linkableBlock(range.startContainer, body) : null;
    if (!block) return;
    const had = block.dataset.linkId;
    const id = linkIdOf(block);
    if (had !== id) session.commit();
    try {
      await copyPageLink(session.noteId, blockWords(block) || noteTitle(getNote(session.noteId)), id);
      showToast({ kind: 'success', title: 'Link to block copied', description: 'Paste it into any note to link here.' });
    } catch {
      showToast({ kind: 'error', title: 'Could not copy the link' });
    }
  }

  function format(command: string) {
    session.checkpoint();
    document.execCommand(command);
    session.commit();
    setFormatted(count => count + 1);
  }

  /* Turn the selected lines into another kind (one undo step), then select their words again */
  /* so the bar stays on them (in Block mode the block is redrawn, leaving the caret at the end). */
  function changeType(type: LineType) {
    const range = savedRange.current;
    const root = session.body();
    window.clearTimeout(hoverTimer.current);
    setTypesOpen(null);
    if (!range || !root) return;
    restoreSelection();
    const found = linesInRange(range, root);
    if (!found) return;
    session.checkpoint();
    const { first, last } = changeLinesType(found, type, root);
    session.linesChanged(last, true);
    requestAnimationFrame(() => {
      if (!first.isConnected || !last.isConnected) return;
      const words = document.createRange();
      words.setStart(first, 0);
      words.setEnd(last, last.childNodes.length);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(words);
    });
  }

  /* The link button removes a link when the selection is already inside one. */
  function startLink() {
    const node = savedRange.current?.commonAncestorContainer;
    const link = elementOf(node)?.closest<HTMLAnchorElement>(LINK);
    if (link) {
      session.checkpoint();
      unwrapLink(link);
      session.commit();
      close();
      return;
    }
    setMode('link');
  }

  /* Link the selected words to what was chosen in Add link. Words across several lines become */
  /* one link per line, as the browser makes them. */
  function applyLink(target: LinkTarget) {
    const body = session.body();
    restoreSelection();
    if (!body) return;
    session.checkpoint();
    if (!linkSelection(body, target)) {
      document.execCommand('createLink', false, NEW_LINK);
      body.querySelectorAll<HTMLAnchorElement>(`a[href="${NEW_LINK}"]`).forEach(link => setLinkTarget(link, target));
    }
    session.commit();
    close();
  }

  /* Colour the remembered selection, keep it selected, and go back to the buttons. */
  function applyTextColor(kind: ColorKind, name: ColorName | null) {
    const range = savedRange.current;
    if (!range) return;
    restoreSelection();
    session.checkpoint();
    const colored = applyColor(range, kind, name);
    if (colored) {
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(colored);
      savedRange.current = colored.cloneRange();
    }
    session.commit();
    if (name) rememberColor(`${kind}-${name}`);
    modeRef.current = 'buttons';
    setMode('buttons');
  }

  function applyComment() {
    const range = savedRange.current;
    if (range && value.trim()) session.addComment(range, value);
    close();
  }

  /* Enter confirms; Escape closes the bar without leaving the note. */
  function handleInputKey(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      restoreSelection();
      close();
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      applyComment();
    }
  }

  /* Buttons keep the note's selection by ignoring the mouse press itself. */
  const keepSelection = (event: MouseEvent) => event.preventDefault();

  /* The Turn into list, beside the bar. */
  function renderTypes() {
    return (
      <div className={`page-menu selection-types is-${typesSide}`} role="menu" aria-label="Turn into" ref={typesRef} onKeyDown={handleTypesKey}>
        {LINE_TYPES.map(type => (
          <button
            key={type.id}
            type="button"
            role="menuitemradio"
            aria-checked={type.id === lineKind}
            className="page-menu-item selection-type"
            onMouseDown={keepSelection}
            onClick={() => changeType(type.id)}
          >
            <Icon name={type.icon} size={14} />
            <span>{type.label}</span>
            {type.id === lineKind && <Icon name="check" size={14} className="dropdown-check" />}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div ref={barRef} className="selection-toolbar" role="toolbar" aria-label="Format selected text" style={{ top: position.top, left: position.left }}>
      {mode === 'buttons' && (lines
        ? (
          <div className="selection-kind-row" onMouseEnter={() => hoverKind(true)} onMouseLeave={() => hoverKind(false)}>
            <button
              ref={kindRef}
              type="button"
              className={`selection-kind is-button ${typesOpen ? 'is-open' : ''}`}
              aria-haspopup="menu"
              aria-expanded={Boolean(typesOpen)}
              aria-label={`${anchor.kind}: turn into another kind of line`}
              onMouseDown={keepSelection}
              onClick={() => openTypes('keys')}
              onKeyDown={handleKindKey}
            >
              <span>{anchor.kind}</span>
              <Icon name="chevron-right" size={14} />
            </button>
            {typesOpen && renderTypes()}
          </div>
        )
        : <span className="selection-kind">{anchor.kind}</span>)}
      {mode === 'buttons' && !locked && (
        <div className="selection-toolbar-row">
          {!locked && (
            <button type="button" className="selection-tool selection-color" aria-label="Text and background colour" data-tooltip="Colour" onMouseDown={keepSelection} onClick={() => setMode('color')}>
              A
            </button>
          )}
          {!locked && FORMATS.map(item => {
            const on = formatIsOn(item.command);
            return (
              <button
                key={item.command}
                type="button"
                className={`selection-tool ${on ? 'is-active' : ''}`}
                aria-label={item.label}
                aria-pressed={on}
                data-tooltip={item.label}
                data-shortcut={item.shortcut}
                onMouseDown={keepSelection}
                onClick={() => format(item.command)}
              >
                <Icon name={item.icon} size={15} />
              </button>
            );
          })}
          {!locked && (
            <button
              type="button"
              className={`selection-tool ${inLink ? 'is-active' : ''}`}
              aria-label={inLink ? 'Remove link' : 'Add link'}
              aria-pressed={inLink}
              data-tooltip={inLink ? 'Remove link' : 'Link'}
              onMouseDown={keepSelection}
              onClick={startLink}
            >
              <Icon name="link" size={15} />
            </button>
          )}
          {!locked && (
            <button
              type="button"
              className="selection-tool"
              aria-label="Copy link to block"
              data-tooltip="Copy link to block"
              onMouseDown={keepSelection}
              onClick={copyBlockLink}
            >
              <Icon name="copy" size={15} />
            </button>
          )}
        </div>
      )}
      {mode === 'buttons' && (
        <button type="button" className="selection-tool selection-comment-button" onMouseDown={keepSelection} onClick={() => setMode('comment')}>
          <Icon name="message-square" size={15} />
          <span>Comment</span>
        </button>
      )}

      {mode === 'color' && savedRange.current && (
        <ColorPalette
          current={{ text: colorAt(savedRange.current, 'text'), bg: colorAt(savedRange.current, 'bg') }}
          onPick={applyTextColor}
        />
      )}

      {mode === 'link' && (
        <LinkPicker
          session={session}
          kind="web"
          onPick={applyLink}
          onCancel={() => {
            restoreSelection();
            close();
          }}
        />
      )}

      {mode === 'comment' && (
        <div className="selection-comment">
          <textarea
            className="selection-input"
            autoFocus
            rows={2}
            placeholder="Write a comment…"
            aria-label="Comment"
            value={value}
            onChange={event => setValue(event.target.value)}
            onKeyDown={handleInputKey}
          />
          <div className="selection-comment-actions">
            <button type="button" className="btn btn-quiet" onClick={() => { restoreSelection(); close(); }}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={!value.trim()} onClick={applyComment}>Comment</button>
          </div>
        </div>
      )}
    </div>
  );
}
