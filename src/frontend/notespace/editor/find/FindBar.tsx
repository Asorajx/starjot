import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '../../../components/Icon';
import { useEscape } from '../../../lib/useDismiss';
import { shortcutLabel } from '../../../app/shortcuts';
import { showTabOf } from '../text/tabs';
import { useSessionValue, type EditorSession } from '../session';
import { clearMatches, findMatches, replaceAll, replaceMatch, showMatches } from './find';

type FindBarProps = {
  session: EditorSession;
  locked: boolean;

  /* The note's saved text, so matches are found again after every change. */
  content: string;

  /* The part of the note to search (the text selected when Ctrl+F was pressed), or null for all. */
  within: Range | null;

  /* Show the replace row as the bar opens (Ctrl+H). */
  replacing: boolean;

  /* Words to find as the bar opens, such as the ones a search matched. */
  initialWords?: string;
  onClearWithin: () => void;
  onClose: () => void;

  /* A canvas searches its text boxes rather than one editor (root), brings a match into view by */
  /* moving the canvas (reveal), and saves replaced words back into their boxes (save). */
  canvas?: { root: () => Element | null; reveal: (range: Range) => void; save: () => void };
};


/* =========================
   Find Bar
   ========================= */

/* Find words in the note (Ctrl+F), going from match to match, and replace them. Enter goes to */
/* the next match and Shift+Enter to the one before; in the replace box, Enter replaces the */
/* current match. Escape closes the bar. A locked note can be searched but not changed. */
export function FindBar({ session, locked, content, within, replacing, initialWords = '', onClearWithin, onClose, canvas }: FindBarProps) {
  const [query, setQuery] = useState(initialWords);
  const [replacement, setReplacement] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [showReplace, setShowReplace] = useState(replacing && !locked);
  const [current, setCurrent] = useState(0);
  const queryRef = useRef<HTMLInputElement>(null);

  /* The canvas's hooks are new functions on every render, so effects read the latest ones. */
  const canvasHooks = useRef(canvas);
  canvasHooks.current = canvas;

  /* Matches are found again whenever the note's text changes (typing, replacing), and when undo */
  /* draws the text again (a new revision). */
  const revision = useSessionValue(session, snapshot => snapshot.revision);

  const [matches, setMatches] = useState<Range[]>([]);
  const [scope, setScope] = useState<Range | null>(within);

  /* Searched after the screen updates, so text drawn again by undo is already in place. Undo */
  /* also replaces the selected part searched, so then the whole note is searched instead. */
  useEffect(() => {
    const body = canvasHooks.current ? canvasHooks.current.root() : session.body();
    const part = within?.startContainer.isConnected && body?.contains(within.startContainer) ? within : null;
    setScope(part);
    setMatches(body ? findMatches(body, query, matchCase, part) : []);
  }, [session, query, matchCase, within, revision, content]);
  const index = matches.length ? Math.min(current, matches.length - 1) : -1;

  useEffect(() => {
    queryRef.current?.focus();
    queryRef.current?.select();
  }, [within, replacing]);

  useEffect(() => {
    if (replacing && !locked) setShowReplace(true);
  }, [replacing, locked]);

  /* Show the matches, and scroll the current one into view (a third of the way down), showing */
  /* the tab it is in first when it sits in a hidden tab of a tab block. */
  useEffect(() => {
    showMatches(matches, index, scope);
    const range = matches[index];
    showTabOf(range?.startContainer ?? null);
    if (canvasHooks.current) {
      if (range) canvasHooks.current.reveal(range);
      return;
    }
    const scroller = session.scroller();
    if (range && scroller) {
      const box = range.getBoundingClientRect();
      const view = scroller.getBoundingClientRect();
      if (box.top < view.top + 56 || box.bottom > view.bottom - 24) scroller.scrollBy({ top: box.top - view.top - view.height / 3 });
    }
  }, [matches, index, scope, session]);
  useEffect(() => clearMatches, []);

  useEscape(true, onClose);

  const step = (direction: 1 | -1) => {
    if (matches.length) setCurrent((index + direction + matches.length) % matches.length);
  };

  function replaceCurrent() {
    const range = matches[index];
    if (!range || locked) return;
    session.checkpoint();
    replaceMatch(range, replacement);
    if (canvas) canvas.save();
    else session.commit();
  }

  function replaceEvery() {
    if (!matches.length || locked) return;
    session.checkpoint();
    replaceAll(matches, replacement);
    if (canvas) canvas.save();
    else session.commit();
  }

  function handleFindKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    step(event.shiftKey ? -1 : 1);
  }

  function handleReplaceKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    replaceCurrent();
  }

  const count = query ? (matches.length ? `${index + 1} of ${matches.length}` : 'No results') : '';
  return (
    <div className="find-bar" role="search" aria-label="Find in note">
      <div className="find-row">
        <button
          type="button"
          className={`find-button ${showReplace ? 'is-on' : ''}`}
          aria-label={showReplace ? 'Hide replace' : 'Show replace'}
          aria-expanded={showReplace}
          disabled={locked}
          data-tooltip={locked ? 'Unlock the note to replace words.' : showReplace ? 'Hide replace' : 'Replace'}
          data-shortcut={locked || showReplace ? undefined : shortcutLabel('replace')}
          data-tooltip-align="start"
          onClick={() => setShowReplace(value => !value)}
        >
          <Icon name="chevron-right" size={14} className={showReplace ? 'is-turned' : ''} />
        </button>
        <input ref={queryRef} className="find-input" value={query} placeholder={scope ? 'Find in selection' : canvas ? 'Find in canvas' : 'Find in note'} aria-label="Find" onChange={event => { setQuery(event.target.value); setCurrent(0); }} onKeyDown={handleFindKey} />
        <span className="find-count" aria-live="polite">{count}</span>
        <button type="button" className={`find-button ${matchCase ? 'is-on' : ''}`} aria-pressed={matchCase} aria-label="Match case" data-tooltip="Match case" onClick={() => setMatchCase(value => !value)}>Aa</button>
        <button type="button" className="find-button" aria-label="Previous match" data-tooltip="Previous" data-shortcut="Shift + Enter" disabled={!matches.length} onClick={() => step(-1)}><Icon name="arrow-up" size={14} /></button>
        <button type="button" className="find-button" aria-label="Next match" data-tooltip="Next" data-shortcut="Enter" disabled={!matches.length} onClick={() => step(1)}><Icon name="arrow-down" size={14} /></button>
        <button type="button" className="find-button" aria-label="Close find" data-tooltip="Close" data-shortcut="Esc" data-tooltip-align="end" onClick={onClose}><Icon name="x" size={14} /></button>
      </div>

      {scope && (
        <div className="find-scope">
          <span>Searching the selected text</span>
          <button type="button" className="find-link" onClick={onClearWithin}>Search the whole note</button>
        </div>
      )}

      {showReplace && !locked && (
        <div className="find-row">
          <span className="find-spacer" />
          <input className="find-input" value={replacement} placeholder="Replace with" aria-label="Replace with" onChange={event => setReplacement(event.target.value)} onKeyDown={handleReplaceKey} />
          <button type="button" className="btn btn-sm btn-secondary" disabled={index < 0} onClick={replaceCurrent}>Replace</button>
          <button type="button" className="btn btn-sm btn-secondary" disabled={!matches.length} onClick={replaceEvery}>Replace all</button>
        </div>
      )}
    </div>
  );
}
