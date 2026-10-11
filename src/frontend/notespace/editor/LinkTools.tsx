import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Icon } from '../../components/Icon';
import { getNote, useNotes } from '../store';
import { linkTarget, normalizeAddress, setLinkTarget, unwrapLink, type LinkTarget } from './links';
import type { EditorSession } from './session';

type LinkToolsProps = {
  session: EditorSession;
  locked: boolean;
  onOpenNote: (id: string) => void;
  onOpenNoteInNewTab: (id: string) => void;
};

/* How many pages the link box suggests while typing a page name. */
const PAGE_SUGGESTIONS = 5;

/* A link in the note, or a link in a note's text that was copied. */
const LINK_SELECTOR = 'a[href], a.page-link';


/* =========================
   Opening and Copying Links
   ========================= */

/* The words shown for a page link's page, or "Page not found" once it is deleted. */
function pageTitle(id: string) {
  const note = getNote(id);
  return note ? note.title || 'Untitled note' : 'Page not found';
}

/* A page link is copied both as plain words and as a page link, so pasting it into a note makes the */
/* same page link while pasting it anywhere else gives just its words. */
async function copyLink(link: HTMLAnchorElement, target: LinkTarget) {
  if (target.kind === 'url') {
    await navigator.clipboard.writeText(target.href);
    return;
  }
  const words = link.textContent ?? '';
  const html = `<a class="page-link" data-page="${target.id}">${words.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</a>`;
  if (typeof ClipboardItem === 'undefined') {
    await navigator.clipboard.writeText(words);
    return;
  }
  await navigator.clipboard.write([new ClipboardItem({
    'text/plain': new Blob([words], { type: 'text/plain' }),
    'text/html': new Blob([html], { type: 'text/html' })
  })]);
}


/* =========================
   Link Tools
   ========================= */

/* Hovering a link in the note shows a small bar saying where it leads, with buttons to copy or edit */
/* it (removing it is part of editing). Double-click or Ctrl + click opens the link in a new tab (an */
/* address in a new browser tab, a page in a new Notespace tab); on a locked note a normal click opens it too. */
export function LinkTools({ session, locked, onOpenNote, onOpenNoteInNewTab }: LinkToolsProps) {
  const notes = useNotes();
  const [link, setLink] = useState<HTMLAnchorElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [words, setWords] = useState('');
  const [address, setAddress] = useState('');

  /* The page chosen from the suggestions while editing, or null while an address is typed. */
  const [page, setPage] = useState<string | null>(null);
  const [error, setError] = useState('');

  /* Redraw when the page scrolls, so the bar stays under its link. */
  const [, setScrolled] = useState(0);
  const showTimer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);
  const latest = useRef({ locked, editing, onOpenNote, onOpenNoteInNewTab });
  latest.current = { locked, editing, onOpenNote, onOpenNoteInNewTab };

  useEffect(() => {
    const body = () => session.body();
    const scroller = session.scroller();
    const linkAt = (target: EventTarget | null) => {
      const found = (target as Element | null)?.closest?.<HTMLAnchorElement>(LINK_SELECTOR) ?? null;
      return found && body()?.contains(found) ? found : null;
    };

    function open(found: HTMLAnchorElement, newTab: boolean) {
      const target = linkTarget(found);
      if (!target) return;
      if (target.kind === 'url') window.open(target.href, '_blank', 'noopener');
      else if (getNote(target.id)) (newTab ? latest.current.onOpenNoteInNewTab : latest.current.onOpenNote)(target.id);
    }

    function handleMouseOver(event: MouseEvent) {
      if ((event.target as Element).closest?.('.link-tools')) {
        window.clearTimeout(hideTimer.current);
        return;
      }
      const found = linkAt(event.target);
      if (!found || latest.current.editing) return;
      window.clearTimeout(hideTimer.current);
      window.clearTimeout(showTimer.current);
      showTimer.current = window.setTimeout(() => {
        setLink(found);
        setCopied(false);
      }, 250);
    }

    function handleMouseOut(event: MouseEvent) {
      if (!linkAt(event.target) && !(event.target as Element).closest?.('.link-tools')) return;
      window.clearTimeout(showTimer.current);
      if (latest.current.editing) return;
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setLink(null), 250);
    }

    /* Ctrl + click opens in a new tab. A normal click on a locked note opens a page in this tab, */
    /* like any link on a page that cannot be edited (addresses always open in a new browser tab). */
    function handleClick(event: MouseEvent) {
      const found = linkAt(event.target);
      const command = event.ctrlKey || event.metaKey;
      if (!found || !(command || latest.current.locked)) return;
      event.preventDefault();
      open(found, command);
    }

    /* The browser selects a word on double-click; inside a link the double-click opens it instead. */
    function handleMouseDown(event: MouseEvent) {
      if (event.detail >= 2 && linkAt(event.target)) event.preventDefault();
    }

    function handleDoubleClick(event: MouseEvent) {
      const found = linkAt(event.target);
      if (!found) return;
      event.preventDefault();
      open(found, true);
    }

    function handleScroll() {
      setScrolled(count => count + 1);
    }

    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('click', handleClick);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('dblclick', handleDoubleClick);
    scroller?.addEventListener('scroll', handleScroll);
    return () => {
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('dblclick', handleDoubleClick);
      scroller?.removeEventListener('scroll', handleScroll);
      window.clearTimeout(showTimer.current);
      window.clearTimeout(hideTimer.current);
    };
  }, []);

  /* While editing, clicking outside the bar or pressing Escape closes it without changes. */
  useEffect(() => {
    if (!editing) return;
    function handleMouseDown(event: MouseEvent) {
      if (!(event.target as Element).closest?.('.link-tools')) close();
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [editing]);

  /* Undo or a mode change redraws the note, which removes the link the bar was for. */
  const target = link?.isConnected ? linkTarget(link) : null;
  if (!link || !target) return null;
  const shown = link;

  function close() {
    setEditing(false);
    setLink(null);
    setError('');
  }

  function startEditing() {
    if (!target) return;
    setWords(shown.textContent ?? '');
    setAddress(target.kind === 'url' ? target.href : pageTitle(target.id));
    setPage(target.kind === 'page' ? target.id : null);
    setError('');
    setEditing(true);
  }

  function save(event?: FormEvent) {
    event?.preventDefault();
    const href = page ? null : normalizeAddress(address);
    if (!page && !href) {
      setError('Enter a web address, or type a page name and pick the page.');
      return;
    }
    session.checkpoint();
    const text = words.trim() ? words : page ? pageTitle(page) : address.trim();
    if (text !== shown.textContent) shown.textContent = text;
    setLinkTarget(shown, page ? { kind: 'page', id: page } : { kind: 'url', href: href as string });
    session.commit();
    setEditing(false);
    setError('');
  }

  function remove() {
    session.checkpoint();
    unwrapLink(shown);
    session.commit();
    close();
  }

  async function copy() {
    if (!target) return;
    try {
      await copyLink(shown, target);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
  }

  /* Pages whose title holds the typed words, while the box does not hold an address. */
  const query = address.trim().toLowerCase();
  const looksLikeAddress = /^[a-z][a-z0-9+.-]*:|^www\.|\.[a-z]{2,}(\/|$)/i.test(address.trim());
  const suggestions = editing && !page && query && !looksLikeAddress
    ? notes.filter(note => (note.title || 'Untitled note').toLowerCase().includes(query)).slice(0, PAGE_SUGGESTIONS)
    : [];

  /* The bar sits under the link, or above it when there is no room below. */
  const bounds = shown.getBoundingClientRect();
  const above = bounds.bottom + (editing ? 260 : 120) > window.innerHeight && bounds.top > 260;
  const style = {
    top: above ? bounds.top - 6 : bounds.bottom + 6,
    left: Math.max(8, Math.min(bounds.left, window.innerWidth - 348)),
    transform: above ? 'translateY(-100%)' : undefined
  };
  const pageName = target.kind === 'page' ? pageTitle(target.id) : '';

  return (
    <div className={`link-tools${editing ? ' is-editing' : ''}`} style={style} role="dialog" aria-label="Link" onKeyDown={handleKeyDown}>
      {!editing ? (
        <>
          <span className="link-tools-target">
            <Icon name={target.kind === 'url' ? 'globe' : 'file-text'} size={15} />
            <span className="link-tools-text">
              {target.kind === 'url' ? target.href.replace(/^(https?:\/\/|mailto:)/i, '').replace(/\/$/, '') : pageName}
            </span>
          </span>
          <span className="link-tools-buttons">
            <button type="button" className="page-bar-button" data-tooltip={copied ? 'Copied' : 'Copy link'} aria-label="Copy link" onClick={copy}>
              <Icon name={copied ? 'check' : 'copy'} size={16} />
            </button>
            {!locked && <button type="button" className="btn btn-sm btn-tertiary" onClick={startEditing}>Edit</button>}
          </span>
        </>
      ) : (
        <form className="link-tools-form" onSubmit={save}>
          <label>
            <span>Text</span>
            <input className="selection-input" value={words} autoFocus onChange={event => setWords(event.target.value)} />
          </label>
          <label>
            <span>Link</span>
            <input
              className="selection-input"
              value={address}
              placeholder="Paste an address or type a page name"
              onChange={event => {
                setAddress(event.target.value);
                setPage(null);
                setError('');
              }}
            />
          </label>
          {page && <span className="link-tools-chosen"><Icon name="file-text" size={13} /> Links to the page {pageTitle(page)}</span>}
          {suggestions.length > 0 && (
            <span className="link-tools-suggestions" role="listbox" aria-label="Pages">
              {suggestions.map(note => (
                <button
                  key={note.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="page-menu-item"
                  onClick={() => {
                    setPage(note.id);
                    setAddress(note.title || 'Untitled note');
                  }}
                >
                  <Icon name="file-text" size={14} /> {note.title || 'Untitled note'}
                </button>
              ))}
            </span>
          )}
          {error && <span className="link-tools-error" role="alert">{error}</span>}
          <span className="link-tools-actions">
            <button type="button" className="btn btn-sm btn-danger link-tools-remove" onClick={remove}>Remove link</button>
            <button type="button" className="btn btn-sm btn-tertiary" onClick={() => setEditing(false)}>Cancel</button>
            <button type="submit" className="btn btn-sm btn-primary">Save</button>
          </span>
        </form>
      )}
    </div>
  );
}
