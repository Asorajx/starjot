import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Icon, type IconName } from '../../../components/Icon';
import { getNote, noteIcon, noteTitle, useNotes } from '../../store';
import { normalizeAddress, type LinkTarget } from './links';
import { blockChoices, linkIdForBlock } from './blockChoices';
import type { EditorSession } from '../session';

/* What a link leads to: another note, one block in a note, or a web address. */
export type LinkKind = 'note' | 'block' | 'web';

type LinkPickerProps = {
  session: EditorSession;
  kind: LinkKind;

  /* Called with where the link leads and the words to show for it. */
  onPick: (target: LinkTarget, words: string, kind: LinkKind) => void;
  onCancel: () => void;

  /* Cancel when focus leaves the picker (the slash menu; the toolbar closes on its own). */
  cancelOnBlur?: boolean;
};

type Item = { key: string; icon: ReactNode; label: string; hint?: string; pick: () => void };

const KINDS: { id: LinkKind; label: string; icon: IconName }[] = [
  { id: 'note', label: 'Note', icon: 'file-text' },
  { id: 'block', label: 'Block', icon: 'align-left' },
  { id: 'web', label: 'Web', icon: 'globe' }
];

/* How many notes the list shows at once; a note's blocks are all listed (the list scrolls). */
const NOTE_RESULTS = 8;

/* Typed words that look like an address rather than a note's name. */
const LOOKS_LIKE_ADDRESS = /^[a-z][a-z0-9+.-]*:|^www\.|\.[a-z]{2,}(\/|$)/i;


/* =========================
   Link Picker
   ========================= */

/* Add link: choose a note, a block in a note (this note first) or a web address, from one search */
/* box. Used by "/" → Add link and by the selection toolbar's link button (and Ctrl + K). */
export function LinkPicker({ session, kind: firstKind, onPick, onCancel, cancelOnBlur = false }: LinkPickerProps) {
  const notes = useNotes();
  const [kind, setKind] = useState<LinkKind>(firstKind);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const [error, setError] = useState('');

  /* In Block, the note whose blocks are listed, once one is chosen. */
  const [blockNote, setBlockNote] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.querySelector('.slash-menu-item.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function choose(next: LinkKind) {
    setKind(next);
    setBlockNote(null);
    setSearch('');
    setActive(0);
    setError('');
    input.current?.focus();
  }

  /* The open editor's text, for links to this note's own blocks (which may not be saved yet). */
  const live = (id: string) => (id === session.noteId ? session.body() : null);

  function pickBlock(noteId: string, index: number, words: string) {
    const id = linkIdForBlock(noteId, index, live(noteId));
    if (!id) {
      setError('That block is gone. Pick another.');
      return;
    }
    onPick({ kind: 'page', id: noteId, block: id }, words, 'block');
  }

  function pickAddress() {
    const href = normalizeAddress(search);
    if (!href) {
      setError('Enter a web or email address, such as example.com.');
      return;
    }
    onPick({ kind: 'url', href }, search.trim(), 'web');
  }

  const query = search.trim().toLowerCase();
  const noteIconOf = (note: (typeof notes)[number]) => note.icon || <Icon name={noteIcon(note)} size={15} />;
  const matching = notes.filter(note => `${noteTitle(note)} ${note.subtitle}`.toLowerCase().includes(query));
  const address = search.trim() && LOOKS_LIKE_ADDRESS.test(search.trim()) ? normalizeAddress(search) : null;

  let items: Item[] = [];
  if (kind === 'note') {
    items = matching.filter(note => note.id !== session.noteId).slice(0, NOTE_RESULTS).map(note => ({
      key: note.id, icon: noteIconOf(note), label: noteTitle(note), pick: () => onPick({ kind: 'page', id: note.id }, noteTitle(note), 'note')
    }));

    /* An address typed here can still be linked, without going to Web first. */
    if (address) items.unshift({ key: 'address', icon: <Icon name="globe" size={15} />, label: search.trim(), hint: 'Web', pick: pickAddress });
  } else if (kind === 'block' && !blockNote) {
    const here = matching.filter(note => note.id === session.noteId);
    items = [...here, ...matching.filter(note => note.id !== session.noteId)].slice(0, NOTE_RESULTS).map(note => ({
      key: note.id,
      icon: noteIconOf(note),
      label: noteTitle(note),
      hint: note.id === session.noteId ? 'This note' : undefined,
      pick: () => {
        setBlockNote(note.id);
        setSearch('');
        setActive(0);
        setError('');
        input.current?.focus();
      }
    }));
  } else if (kind === 'block' && blockNote) {
    items = blockChoices(blockNote, live(blockNote))
      .filter(choice => choice.words.toLowerCase().includes(query))
      .map(choice => ({
        key: String(choice.index), icon: <Icon name={choice.icon} size={15} />, label: choice.words, pick: () => pickBlock(blockNote, choice.index, choice.words)
      }));
  } else if (address) {
    items = [{ key: 'address', icon: <Icon name="globe" size={15} />, label: search.trim(), hint: 'Enter', pick: pickAddress }];
  }
  const index = Math.min(active, Math.max(items.length - 1, 0));

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (items.length) setActive((index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (items[index]) items[index].pick();
      else if (kind === 'web') pickAddress();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    } else if (event.key === 'Backspace' && !search && blockNote) {
      /* Backspace in an empty search goes back from a note's blocks to the notes. */
      event.preventDefault();
      setBlockNote(null);
      setActive(0);
    }
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (cancelOnBlur && !event.currentTarget.contains(event.relatedTarget as Node | null)) onCancel();
  }

  /* Buttons keep focus in the search box, so typing carries on. */
  const keepFocus = (event: MouseEvent) => event.preventDefault();
  const placeholder = kind === 'web' ? 'Paste or type a web address' : blockNote ? 'Search this note’s blocks…' : 'Search notes…';
  const empty = kind === 'web' ? 'Type an address, then press Enter' : blockNote ? 'No blocks with words found' : 'No notes found';

  return (
    <div className="link-picker" onBlur={handleBlur}>
      <div className="link-picker-kinds" role="tablist" aria-label="Link to">
        {KINDS.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === kind}
            className={item.id === kind ? 'is-chosen' : ''}
            onMouseDown={keepFocus}
            onClick={() => choose(item.id)}
          >
            <Icon name={item.icon} size={13} />
            {item.label}
          </button>
        ))}
      </div>
      {blockNote && (
        <button type="button" className="link-picker-back" onMouseDown={keepFocus} onClick={() => setBlockNote(null)}>
          <Icon name="arrow-left" size={13} />
          <span>{noteTitle(getNote(blockNote))}</span>
        </button>
      )}
      <input
        ref={input}
        className="slash-menu-search"
        autoFocus
        placeholder={placeholder}
        aria-label={placeholder.replace('…', '')}
        value={search}
        onChange={event => {
          setSearch(event.target.value);
          setActive(0);
          setError('');
        }}
        onKeyDown={handleKeyDown}
      />
      {error && <p className="link-picker-error" role="alert">{error}</p>}
      <div className="link-picker-list" ref={list} role="listbox" aria-label={kind === 'web' ? 'Address' : blockNote ? 'Blocks' : 'Notes'}>
        {items.length ? items.map((item, at) => (
          <button
            key={item.key}
            type="button"
            role="option"
            aria-selected={at === index}
            className={`slash-menu-item ${at === index ? 'is-active' : ''}`}
            onMouseDown={keepFocus}
            onMouseMove={() => setActive(at)}
            onClick={item.pick}
          >
            <span className="slash-menu-icon">{item.icon}</span>
            <span className="slash-menu-name">{item.label}</span>
            {item.hint && <kbd>{item.hint}</kbd>}
          </button>
        )) : <p className="slash-menu-empty">{empty}</p>}
      </div>
    </div>
  );
}
