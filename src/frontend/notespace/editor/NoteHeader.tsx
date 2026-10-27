import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Dropdown } from '../../components/Dropdown';
import { EmojiPicker } from '../../components/EmojiPicker';
import { Icon } from '../../components/Icon';
import { usePreferences } from '../../app/preferences';
import { noteIcon, noteTitle, scheduleSave, UNTITLED_NOTE, updateNote, useCategories, useNotes } from '../store';
import { isEmptyContent, placeCaret, wrapLooseLines } from './text/dom';
import { linkTypedAddress } from './links/links';
import { applyMarkdownShortcut } from './text/markdown';
import { deleteSelection, insertPasted, linkSelectionToPasted } from './text/paste';
import { pastedLines } from './text/clipboard';
import type { Note } from '../../../shared/types/note';
import { formatDate } from '../../lib/dates';
import { opensNewTab, type OpenById } from '../../lib/clicks';
import { useBoard } from '../../boardspace/board';
import { WorkTypeIcon } from '../../boardspace/workParts';
import type { WorkItem } from '../../../shared/types/board';
import { notesLinkingTo } from '../backlinks';

type NoteHeaderProps = {
  note: Note;
  locked: boolean;
  onOpenNote: OpenById;

  /* Opens a linked work item in Boardspace's editor; left out, the Work row does not show. */
  onOpenWorkItem?: (item: WorkItem) => void;
};

/* Every page inside a page, at any depth (only one level today, but older notes may have more). */
function countPages(notes: Note[], parentId: string): number {
  return notes.filter(note => note.parentId === parentId).reduce((total, note) => total + 1 + countPages(notes, note.id), 0);
}

type RemarksFieldProps = {
  note: Note;
  locked: boolean;

  /* Put the caret in it straight away (when it was just added with Add remarks). */
  autoFocus?: boolean;
};

type DescriptionFieldProps = {
  note: Note;
  locked: boolean;
  onChange: (subtitle: string) => void;

  /* Open the box to type in straight away (when it was just added with Add description). */
  startOpen?: boolean;
};

/* The description shows on one line, ending in "…" when it is longer (hovering then shows all of */
/* it). Clicking it, or Enter, opens a box that grows to show everything, to read or edit; Enter, */
/* Escape or clicking away closes it. A locked note's description can be opened to read. */
function DescriptionField({ note, locked, onChange, startOpen = false }: DescriptionFieldProps) {
  const [open, setOpen] = useState(startOpen);
  const [cutOff, setCutOff] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const shownRef = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  /* The open box is as tall as its text. */
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!open || !box) return;
    box.style.height = 'auto';
    box.style.height = `${box.scrollHeight + 2}px`;
  }, [open, note.subtitle]);

  /* Whether the one line hides part of the description, so the tooltip only shows then. */
  useLayoutEffect(() => {
    const text = textRef.current;
    setCutOff(Boolean(text && text.scrollWidth > text.clientWidth + 1));
  }, [open, note.subtitle]);

  function close() {
    setOpen(false);
    requestAnimationFrame(() => shownRef.current?.focus({ preventScroll: true }));
  }

  if (!open) {
    return (
      <button
        ref={shownRef}
        type="button"
        className={`note-detail-field note-description ${note.subtitle ? '' : 'is-empty'}`}
        aria-label={`Description: ${note.subtitle || 'none'}`}
        data-tooltip={cutOff ? note.subtitle : undefined}
        data-tooltip-wrap=""
        data-tooltip-align="start"
        onClick={() => setOpen(true)}
      >
        <span ref={textRef}>{note.subtitle || (locked ? 'No description' : 'Add a description')}</span>
      </button>
    );
  }

  return (
    <textarea
      ref={boxRef}
      className="note-detail-field note-description-box"
      aria-label="Description"
      rows={1}
      maxLength={250}
      autoFocus
      placeholder={locked ? 'No description' : 'Add a description'}
      readOnly={locked}
      value={note.subtitle}
      onFocus={event => event.currentTarget.setSelectionRange(event.currentTarget.value.length, event.currentTarget.value.length)}
      onChange={event => onChange(event.target.value.replace(/\n/g, ' '))}
      onBlur={() => setOpen(false)}
      onKeyDown={event => {
        if (event.key !== 'Enter' && event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
    />
  );
}

/* Remarks taller than this many lines are folded while not being edited (see RemarksField). */
const REMARKS_FOLDED_LINES = 3;

/* Remarks are written like the note's own text: Markdown shortcuts (#, -, 1., >, ``` and ---) work, */
/* and so do Ctrl + B / I / U. The field keeps its own undo, separate from the note's. Long */
/* remarks are folded to a few lines, with a fade and Show all, until clicked into (or opened to */
/* read on a locked note). */
function RemarksField({ note, locked, autoFocus = false }: RemarksFieldProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { spellcheck } = usePreferences();
  const [empty, setEmpty] = useState(!note.remarks);
  const [long, setLong] = useState(false);
  const [open, setOpen] = useState(false);

  /* Whether the remarks run past the folded height. */
  function measure() {
    const field = ref.current;
    if (!field) return;
    const lineHeight = parseFloat(getComputedStyle(field).lineHeight) || 20;
    setLong(field.scrollHeight > lineHeight * REMARKS_FOLDED_LINES + 12);
  }

  /* Filled once per note; after that the browser owns the text while typing, like the note itself. */
  useLayoutEffect(() => {
    if (ref.current) ref.current.innerHTML = note.remarks;
    setEmpty(!note.remarks);
    setOpen(false);
    measure();
    if (autoFocus) ref.current?.focus();
  }, [note.id]);

  /* A narrower window can make the remarks taller. */
  useEffect(() => {
    const field = ref.current;
    if (!field) return;
    const observer = new ResizeObserver(measure);
    observer.observe(field);
    return () => observer.disconnect();
  }, []);

  function save() {
    const field = ref.current;
    if (!field) return;
    wrapLooseLines(field);
    setEmpty(isEmptyContent(field));
    updateNote(note.id, { remarks: isEmptyContent(field) ? '' : field.innerHTML }, false);
    scheduleSave();
  }

  /* Show all opens the remarks: for editing, with the caret at the end; read only when locked. */
  function showAll() {
    setOpen(true);
    const field = ref.current;
    if (!field || locked) return;
    field.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(field);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }

  const folded = long && !open;

  /* A web address typed just before Space or Enter becomes a link, like in the note. */
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const field = ref.current;
    if (!field) return;
    const plainKey = (event.key === ' ' || event.key === 'Enter') && !event.altKey && !event.ctrlKey && !event.metaKey;
    if (plainKey && linkTypedAddress(field)) save();
    if (applyMarkdownShortcut(event.nativeEvent, field)) save();
  }

  /* Paste plain text only, like the note itself: Markdown, web addresses and page addresses in */
  /* the text are turned into formatting and links. */
  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const field = ref.current;
    if (field && linkSelectionToPasted(field, event.clipboardData.getData('text/plain'))) {
      save();
      return;
    }
    const lines = pastedLines(event.clipboardData);
    if (field && lines) {
      deleteSelection(field);
      insertPasted(field, lines);
      save();
      return;
    }
    document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
  }

  return (
    <>
      <div
        ref={ref}
        className={`note-remarks ${empty ? 'is-empty' : ''} ${folded ? 'is-folded' : ''}`}
        style={folded ? { maxHeight: `calc(${REMARKS_FOLDED_LINES} * 1.7em + 10px)` } : undefined}
        data-remarks=""
        data-placeholder={locked ? 'No remarks' : 'Add remarks'}
        contentEditable={!locked}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Remarks"
        spellCheck={spellcheck}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => locked && setOpen(current => !current)}
        onKeyDown={handleKeyDown}
        onInput={() => {
          save();
          measure();
        }}
        onPaste={handlePaste}
      />
      {folded && (
        <button type="button" className="note-remarks-more" onMouseDown={event => event.preventDefault()} onClick={showAll}>
          Show all
        </button>
      )}
    </>
  );
}

type PageListProps = {
  notes: Note[];
  parentId: string;
  onOpenNote: OpenById;
};

/* The sub-pages of a page, oldest first (the order they were added), each followed by its own */
/* sub-pages. They are shown side by side. Hovering one shows a preview. */
function PageList({ notes, parentId, onOpenNote }: PageListProps) {
  const pages = notes.filter(note => note.parentId === parentId).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  if (!pages.length) return null;
  return (
    <ul className="note-page-list">
      {pages.map(page => (
        <li key={page.id}>
          <button type="button" className="note-page-link" data-preview-page={page.id} onClick={event => onOpenNote(page.id, opensNewTab(event))}>
            {page.icon ? <span className="note-page-icon" aria-hidden="true">{page.icon}</span> : <Icon name={noteIcon(page)} size={13} />}
            <span className="note-page-title">{noteTitle(page)}</span>
          </button>
          <PageList notes={notes} parentId={page.id} onOpenNote={onOpenNote} />
        </li>
      ))}
    </ul>
  );
}


/* =========================
   Note Header
   ========================= */

/* The top of a note: its icon, title and details (category, description, dates, comments, sub-pages). */
/* Details can be hidden per note; they can only be edited while the note is unlocked. */
export function NoteHeader({ note, locked, onOpenNote, onOpenWorkItem }: NoteHeaderProps) {
  const categories = useCategories();
  const notes = useNotes();
  const board = useBoard();
  const { spaces } = usePreferences();

  /* The work items this note is linked to (links are made from the work item, in Boardspace). */
  const work = spaces.boardspace && onOpenWorkItem ? board.items.filter(item => item.notes?.includes(note.id)) : [];
  const pageCount = countPages(notes, note.id);

  /* The notes whose text links to or mentions this one. */
  const linkedFrom = useMemo(() => notesLinkingTo(notes, note.id), [notes, note.id]);
  const [picking, setPicking] = useState(false);

  /* An empty description or remarks has no row, so the note's text starts closer to its title: */
  /* Add description and Add remarks (beside Add icon) bring the row in, ready to type, and it */
  /* stays while this note is open. A locked note only shows the ones that have something. */
  const [adding, setAdding] = useState<{ description: boolean; remarks: boolean }>({ description: false, remarks: false });
  useEffect(() => setAdding({ description: false, remarks: false }), [note.id]);
  const showDescription = Boolean(note.subtitle) || adding.description;
  const showRemarks = Boolean(note.remarks) || adding.remarks;

  /* Text fields save after a short pause, like typing in the note itself. */
  const changeText = (changes: Partial<Pick<Note, 'title' | 'subtitle'>>) => {
    updateNote(note.id, changes, false);
    scheduleSave();
  };

  /* Only comments whose words are still in the note are counted. */
  const comments = note.comments.filter(comment => note.content.includes(`data-comment="${comment.id}"`)).length;

  const pick = (icon: string) => {
    updateNote(note.id, { icon });
    setPicking(false);
  };

  /* Enter in the title moves on to the start of the note's text, ready to write (in either */
  /* view: the first line of the note, or of its first block). */
  function moveIntoText(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || locked) return;
    const content = event.currentTarget.closest('.editor-width')?.querySelector('.note-content');
    const editable = content?.querySelector<HTMLElement>('[contenteditable="true"]');
    const first = content?.querySelector('[data-note-editable]');
    const line = first?.firstElementChild ?? first;
    if (!editable || !line) return;
    event.preventDefault();
    editable.focus({ preventScroll: true });
    placeCaret(line);
  }

  return (
    <div className="note-header">
      {note.icon && (
        <button type="button" className="note-icon" aria-label="Change icon" disabled={locked} onClick={() => setPicking(true)}>
          {note.icon}
        </button>
      )}

      <div className="note-header-actions">
        {!note.icon && !locked && (
          <button type="button" className="note-header-action" onClick={() => setPicking(true)}>
            <Icon name="sparkles" size={14} /> Add icon
          </button>
        )}

        {!note.detailsHidden && !locked && !showDescription && (
          <button type="button" className="note-header-action" onClick={() => setAdding(current => ({ ...current, description: true }))}>
            <Icon name="type" size={14} /> Add description
          </button>
        )}

        {!note.detailsHidden && !locked && !showRemarks && (
          <button type="button" className="note-header-action" onClick={() => setAdding(current => ({ ...current, remarks: true }))}>
            <Icon name="message-square" size={14} /> Add remarks
          </button>
        )}

        <button type="button" className="note-header-action" aria-expanded={!note.detailsHidden} onClick={() => updateNote(note.id, { detailsHidden: !note.detailsHidden })}>
          <Icon name={note.detailsHidden ? 'list' : 'x'} size={14} /> {note.detailsHidden ? 'Show details' : 'Hide details'}
        </button>

        {/* How many comments are on the note's text (the speech-bubble markers beside the lines). */}
        {comments > 0 && (
          <span className="note-comment-count" title={`${comments} ${comments === 1 ? 'comment' : 'comments'} in this note`}>
            <Icon name="message-square" size={14} /> {comments}
          </span>
        )}
      </div>

      {picking && (
        <EmojiPicker
          current={note.icon}
          onPick={pick}
          onRemove={() => pick('')}
          onClose={() => setPicking(false)}
        />
      )}

      <input
        className="note-title-input"
        type="text"
        aria-label="Note title"
        maxLength={160}
        placeholder={UNTITLED_NOTE}
        autoComplete="off"
        readOnly={locked}
        value={note.title}
        onChange={event => changeText({ title: event.target.value })}
        onKeyDown={moveIntoText}
      />

      {!note.detailsHidden && (
        <dl className="note-details">
          <dt>Category</dt>
          <dd>
            <Dropdown
              label="Category"
              className="note-detail-field note-detail-dropdown"
              wrapperClassName="note-detail-dropdown-wrap"
              disabled={locked}
              value={note.category}
              options={[{ value: '', label: 'None' }, ...categories.map(category => ({ value: category.id, label: category.name, icon: 'folder' as const }))]}
              onChange={category => updateNote(note.id, { category })}
            />
          </dd>

          {showDescription && (
            <>
              <dt>Description</dt>
              <dd>
                <DescriptionField note={note} locked={locked} startOpen={adding.description && !note.subtitle} onChange={subtitle => changeText({ subtitle })} />
              </dd>
            </>
          )}

          <dt>Created</dt>
          <dd>{formatDate(note.createdAt)}</dd>

          {work.length > 0 && (
            <>
              <dt>Work</dt>
              <dd className="note-work">
                {work.map(item => (
                  <button key={item.id} type="button" className="note-work-item" onClick={() => onOpenWorkItem?.(item)}>
                    <WorkTypeIcon type={item.type} />
                    {item.name}
                  </button>
                ))}
              </dd>
            </>
          )}

          {linkedFrom.length > 0 && (
            <>
              <dt>Linked from</dt>
              <dd className="note-work note-backlinks">
                {linkedFrom.map(source => (
                  <button key={source.id} type="button" className="note-work-item" data-preview-page={source.id} onClick={event => onOpenNote(source.id, opensNewTab(event))}>
                    {source.icon ? <span className="note-page-icon" aria-hidden="true">{source.icon}</span> : <Icon name={noteIcon(source)} size={14} />}
                    {noteTitle(source)}
                  </button>
                ))}
              </dd>
            </>
          )}

          {showRemarks && (
            <>
              <dt className="note-remarks-label">Remarks</dt>
              <dd className="note-remarks-cell"><RemarksField note={note} locked={locked} autoFocus={adding.remarks && !note.remarks} /></dd>
            </>
          )}

          {/* The Pages row only shows when the note has sub-pages. The list can be folded on its own, */}
          {/* so the other details stay visible. */}
          {pageCount > 0 && (
            <>
              <dt className="note-pages-label">Sub-notes</dt>
              <dd className="note-pages">
                <button
                  type="button"
                  className="note-pages-toggle"
                  aria-expanded={!note.pagesHidden}
                  onClick={() => updateNote(note.id, { pagesHidden: !note.pagesHidden })}
                >
                  <Icon name="chevron-right" size={13} className={note.pagesHidden ? '' : 'is-turned'} />
                  {pageCount} {pageCount === 1 ? 'sub-note' : 'sub-notes'}
                </button>
                {!note.pagesHidden && <PageList notes={notes} parentId={note.id} onOpenNote={onOpenNote} />}
              </dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}
