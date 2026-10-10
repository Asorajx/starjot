import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Icon, type IconName } from '../../components/Icon';
import { safeHref } from '../sanitize';
import type { EditorSession } from './session';

type SelectionToolbarProps = {
  session: EditorSession;
  locked: boolean;
};

type Position = { top: number; left: number };
type Mode = 'buttons' | 'link' | 'comment';

const FORMATS: { command: string; icon: IconName; label: string }[] = [
  { command: 'bold', icon: 'bold', label: 'Bold' },
  { command: 'italic', icon: 'italic', label: 'Italic' },
  { command: 'underline', icon: 'underline', label: 'Underline' },
  { command: 'strikeThrough', icon: 'strikethrough', label: 'Strikethrough' }
];


/* =========================
   Selection Toolbar
   ========================= */

/* A small bar that appears above selected note text: formatting, links and comments. */
/* It uses fixed positioning, so it lines up with the selection at any note zoom level. */
export function SelectionToolbar({ session, locked }: SelectionToolbarProps) {
  const [position, setPosition] = useState<Position | null>(null);
  const [mode, setMode] = useState<Mode>('buttons');
  const [value, setValue] = useState('');

  /* The selection is remembered, because typing a link or comment moves focus into this bar. */
  const savedRange = useRef<Range | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    /* Show the bar for a non-empty selection inside the note; hide it otherwise. */
    function update() {
      if (modeRef.current !== 'buttons') return;
      const selection = window.getSelection();
      const body = document.getElementById('note-body');
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      if (!body || !range || range.collapsed || !body.contains(range.commonAncestorContainer) || !range.toString().trim()) {
        setPosition(null);
        return;
      }
      savedRange.current = range.cloneRange();
      const bounds = range.getBoundingClientRect();

      /* Sit above the selection, or below it when there is no room under the editor toolbar. */
      const above = bounds.top - 48;
      setPosition({ top: above > 64 ? above : bounds.bottom + 10, left: Math.max(12, bounds.left + bounds.width / 2) });
    }

    /* Clicking anywhere outside the bar cancels an unfinished link or comment. */
    function handleMouseDown(event: globalThis.MouseEvent) {
      if (modeRef.current === 'buttons' || (event.target as Element).closest?.('.selection-toolbar')) return;
      modeRef.current = 'buttons';
      setMode('buttons');
      setValue('');
    }

    const scroller = document.getElementById('main-scroll');
    document.addEventListener('selectionchange', update);
    document.addEventListener('mousedown', handleMouseDown);
    scroller?.addEventListener('scroll', update);
    return () => {
      document.removeEventListener('selectionchange', update);
      document.removeEventListener('mousedown', handleMouseDown);
      scroller?.removeEventListener('scroll', update);
    };
  }, []);

  if (!position) return null;

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
    setPosition(null);
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
    <div className="selection-toolbar" role="toolbar" aria-label="Format selected text" style={{ top: position.top, left: position.left }}>
      {mode === 'buttons' && (
        <>
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
        </>
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
