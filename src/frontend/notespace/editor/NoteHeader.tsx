import { useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Dropdown } from '../../components/Dropdown';
import { EmojiPicker } from '../../components/EmojiPicker';
import { Icon } from '../../components/Icon';
import { usePreferences } from '../../app/preferences';
import { noteIcon, noteTitle, scheduleSave, UNTITLED_NOTE, updateNote, useCategories, useNotes } from '../store';
import { isEmptyContent, placeCaret, wrapLooseLines } from './text/dom';
import { linkTypedAddress } from './links/links';
import { applyMarkdownShortcut } from './text/markdown';
import { deleteSelection, insertPasted } from './text/paste';
import { pastedLines } from './text/clipboard';
import type { Note } from '../../../shared/types/note';
import { formatDate } from '../../lib/dates';
import { opensNewTab, type OpenById } from '../../lib/clicks';
import { useBoard } from '../../boardspace/board';
import { WorkTypeIcon } from '../../boardspace/workParts';
import type { WorkItem } from '../../../shared/types/board';

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
};

/* Remarks are written like the note's own text: Markdown shortcuts (#, -, 1., >, ``` and ---) work, */
/* and so do Ctrl + B / I / U. The field keeps its own undo, separate from the note's. */
function RemarksField({ note, locked }: RemarksFieldProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { spellcheck } = usePreferences();
  const [empty, setEmpty] = useState(!note.remarks);

  /* Filled once per note; after that the browser owns the text while typing, like the note itself. */
  useLayoutEffect(() => {
    if (ref.current) ref.current.innerHTML = note.remarks;
    setEmpty(!note.remarks);
  }, [note.id]);

  function save() {
    const field = ref.current;
    if (!field) return;
    wrapLooseLines(field);
    setEmpty(isEmptyContent(field));
    updateNote(note.id, { remarks: isEmptyContent(field) ? '' : field.innerHTML }, false);
    scheduleSave();
  }

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
    <div
      ref={ref}
      className={`note-remarks ${empty ? 'is-empty' : ''}`}
      data-remarks=""
      data-placeholder={locked ? 'No remarks' : 'Add remarks'}
      contentEditable={!locked}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label="Remarks"
      spellCheck={spellcheck}
      onKeyDown={handleKeyDown}
      onInput={save}
      onPaste={handlePaste}
    />
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
  const [picking, setPicking] = useState(false);

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

          <dt>Description</dt>
          <dd>
            <input
              className="note-detail-field"
              type="text"
              aria-label="Description"
              maxLength={250}
              placeholder={locked ? 'No description' : 'Add a description'}
              readOnly={locked}
              value={note.subtitle}
              onChange={event => changeText({ subtitle: event.target.value })}
            />
          </dd>

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

          <dt className="note-remarks-label">Remarks</dt>
          <dd className="note-remarks-cell"><RemarksField note={note} locked={locked} /></dd>

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
