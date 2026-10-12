import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { RECENT_COLORS, getPreferences, updatePreferences, usePreferences } from '../../app/preferences';
import { Icon, type IconName } from '../../components/Icon';
import { safeHref } from '../sanitize';
import { COLOR_NAMES, applyColor, colorAt, type ColorClass, type ColorKind, type ColorName } from './colors';
import type { EditorSession } from './session';

type SelectionToolbarProps = {
  session: EditorSession;
  locked: boolean;
};

type Box = { top: number; bottom: number; left: number; right: number };
type Size = { width: number; height: number };

/* The selection's outline, and the spot where the selection ends (where the mouse was released). */
type Anchor = { selection: Box; end: Box; kind: string };
type Mode = 'buttons' | 'link' | 'comment' | 'color';

/* The editor's top bar covers this much of the window, so the toolbar never goes above it. */
const TOP_LIMIT = 64;
const GAP = 8;

const FORMATS: { command: string; icon: IconName; label: string }[] = [
  { command: 'bold', icon: 'bold', label: 'Bold' },
  { command: 'italic', icon: 'italic', label: 'Italic' },
  { command: 'underline', icon: 'underline', label: 'Underline' },
  { command: 'strikeThrough', icon: 'strikethrough', label: 'Strikethrough' }
];


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
  const element = node instanceof Element ? node : node.parentElement;
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

/* A small bar that appears above selected note text: what kind of text it is (on top), then */
/* formatting, links and comments. */
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

  useEffect(() => {
    /* Show the bar for a non-empty selection inside the note; hide it otherwise. */
    function update() {
      if (modeRef.current !== 'buttons') return;
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

    const scroller = session.scroller();
    document.addEventListener('selectionchange', update);
    document.addEventListener('mousedown', handleMouseDown);
    scroller?.addEventListener('scroll', update);
    return () => {
      document.removeEventListener('selectionchange', update);
      document.removeEventListener('mousedown', handleMouseDown);
      scroller?.removeEventListener('scroll', update);
    };
  }, []);

  /* Escape closes the colours and goes back to the buttons (listening early keeps it from also */
  /* leaving the note). */
  useEffect(() => {
    if (mode !== 'color') return;
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      modeRef.current = 'buttons';
      setMode('buttons');
    }
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [mode]);

  /* Re-measure whenever the bar changes shape, such as opening the comment box. */
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const { width, height } = bar.getBoundingClientRect();
    setSize(current => (current.width === width && current.height === height ? current : { width, height }));
  });

  if (!anchor) return null;
  const position = placeToolbar(anchor, size, { width: window.innerWidth, height: window.innerHeight });

  /* Put the remembered selection back, so a command applies to the text that was selected. */
  function restoreSelection() {
    const range = savedRange.current;
    if (!range) return;
    const host = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)
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

  function format(command: string) {
    session.checkpoint();
    document.execCommand(command);
    session.commit();
  }

  /* The link button removes a link when the selection is already inside one. */
  function startLink() {
    const node = savedRange.current?.commonAncestorContainer;
    const element = node instanceof Element ? node : node?.parentElement;
    if (element?.closest('a[href]')) {
      session.checkpoint();
      document.execCommand('unlink');
      session.commit();
      return;
    }
    setMode('link');
  }

  function applyLink() {
    const address = /^[a-z]+:/i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
    const href = safeHref(address);
    restoreSelection();
    if (href && value.trim()) {
      session.checkpoint();
      document.execCommand('createLink', false, href);
      session.commit();
    }
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
      if (mode === 'link') applyLink();
      else applyComment();
    }
  }

  /* Buttons keep the note's selection by ignoring the mouse press itself. */
  const keepSelection = (event: MouseEvent) => event.preventDefault();

  return (
    <div ref={barRef} className="selection-toolbar" role="toolbar" aria-label="Format selected text" style={{ top: position.top, left: position.left }}>
      {mode === 'buttons' && <span className="selection-kind">{anchor.kind}</span>}
      {mode === 'buttons' && (
        <div className="selection-toolbar-row">
          {!locked && (
            <button type="button" className="selection-tool selection-color" aria-label="Text and background colour" data-tooltip="Colour" onMouseDown={keepSelection} onClick={() => setMode('color')}>
              A
            </button>
          )}
          {!locked && FORMATS.map(item => (
            <button key={item.command} type="button" className="selection-tool" aria-label={item.label} onMouseDown={keepSelection} onClick={() => format(item.command)}>
              <Icon name={item.icon} size={15} />
            </button>
          ))}
          {!locked && (
            <button type="button" className="selection-tool" aria-label="Add or remove link" onMouseDown={keepSelection} onClick={startLink}>
              <Icon name="link" size={15} />
            </button>
          )}
          {!locked && <span className="selection-divider" />}
          <button type="button" className="selection-tool selection-tool--text" onMouseDown={keepSelection} onClick={() => setMode('comment')}>
            <Icon name="message-square" size={15} /> Comment
          </button>
        </div>
      )}

      {mode === 'color' && savedRange.current && (
        <ColorPalette
          current={{ text: colorAt(savedRange.current, 'text'), bg: colorAt(savedRange.current, 'bg') }}
          onPick={applyTextColor}
        />
      )}

      {mode === 'link' && (
        <input
          className="selection-input"
          type="url"
          autoFocus
          placeholder="Paste a link and press Enter"
          aria-label="Link address"
          value={value}
          onChange={event => setValue(event.target.value)}
          onKeyDown={handleInputKey}
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
