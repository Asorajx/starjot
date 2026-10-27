import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Dropdown } from '../../components/Dropdown';
import { EmojiPicker } from '../../components/EmojiPicker';
import { Icon, type IconName } from '../../components/Icon';
import { DETAIL_ROWS, getPreferences, updatePreferences, usePreferences, type DetailRow } from '../../app/preferences';
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
   Detail Rows
   ========================= */

/* Each row of the details has its own icon in the note tools, which shows or hides it. */
const DETAIL_TOOLS: Record<DetailRow, { label: string; icon: IconName }> = {
  category: { label: 'Category', icon: 'folder' },
  description: { label: 'Description', icon: 'align-left' },
  created: { label: 'Created', icon: 'calendar-days' },
  comments: { label: 'Comments', icon: 'message-square' },
  work: { label: 'Work', icon: 'kanban' },
  linkedFrom: { label: 'Linked from', icon: 'link' },
  remarks: { label: 'Remarks', icon: 'message-circle' },
  subNotes: { label: 'Sub-notes', icon: 'layers' }
};

/* Hide a row of the details in every note, or show it again. What the row shows is kept. */
function setDetailShown(row: DetailRow, shown: boolean) {
  const hidden = getPreferences().hiddenDetails.filter(item => item !== row);
  updatePreferences({ hiddenDetails: shown ? hidden : [...hidden, row] });
}

type DetailLineProps = {
  row: DetailRow;
  labelClass?: string;
  cellClass?: string;
  children: ReactNode;
};

/* One row of the details: its label, then its value. */
function DetailLine({ row, labelClass, cellClass, children }: DetailLineProps) {
  return (
    <>
      <dt className={labelClass}>{DETAIL_TOOLS[row].label}</dt>
      <dd className={cellClass}>{children}</dd>
    </>
  );
}


/* =========================
   Note Toolbar
   ========================= */

/* A row's icon in the toolbar: whether its row shows in this note, and whether it can be turned */
/* on (an empty description or remarks cannot be added on a locked note). */
type RowTool = { row: DetailRow; visible: boolean; disabled: boolean };

type NoteToolbarProps = {
  note: Note;
  locked: boolean;
  rows: RowTool[];

  /* Whether any row would show, so Hide / Show details has something to fold. */
  canFold: boolean;
  onIcon: () => void;
  onToggle: (row: DetailRow) => void;
};

/* The note's tools, a slim column of icons in the margin left of its title (a row above it on */
/* phones), so the title and text never move when it opens or closes. The chevron opens or */
/* closes it (remembered for every note); then Add icon; then one icon per row of the details, */
/* lit while its row shows (click to hide or show it); then Hide / Show details, which folds the */
/* whole list (and does nothing while no row is on). */
function NoteToolbar({ note, locked, rows, canFold, onIcon, onToggle }: NoteToolbarProps) {
  const { noteToolbarOpen: open } = usePreferences();
  const tool = (label: string) => ({ 'aria-label': label, 'data-tooltip': label, 'data-tooltip-side': 'right' as const });

  return (
    <div className="note-toolbar">
      <button
        type="button"
        className="note-toolbar-toggle"
        aria-expanded={open}
        aria-controls={`note-tools-${note.id}`}
        {...tool(open ? 'Hide note tools' : 'Show note tools')}
        onClick={() => updatePreferences({ noteToolbarOpen: !open })}
      >
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} />
      </button>

      {open && (
        <div className="note-toolbar-tools" id={`note-tools-${note.id}`} role="toolbar" aria-orientation="vertical" aria-label="Note tools">
          {!locked && (
            <>
              <button type="button" className={note.icon ? 'is-on' : ''} {...tool(note.icon ? 'Change icon' : 'Add icon')} onClick={onIcon}>
                <Icon name="smile-plus" size={16} />
              </button>
              <span className="note-toolbar-rule" aria-hidden="true" />
            </>
          )}
          {rows.map(({ row, visible, disabled }) => {
            const { label, icon } = DETAIL_TOOLS[row];
            return (
              <button
                key={row}
                type="button"
                className={visible ? 'is-on' : ''}
                aria-pressed={visible}
                disabled={disabled}
                {...tool(`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`)}
                onClick={() => onToggle(row)}
              >
                <Icon name={icon} size={16} />
              </button>
            );
          })}
          <span className="note-toolbar-rule" aria-hidden="true" />
          <button
            type="button"
            aria-pressed={note.detailsHidden}
            disabled={!canFold}
            {...tool(note.detailsHidden ? 'Show details' : 'Hide details')}
            onClick={() => updateNote(note.id, { detailsHidden: !note.detailsHidden })}
          >
            <Icon name={note.detailsHidden ? 'eye' : 'eye-off'} size={16} />
          </button>
        </div>
      )}
    </div>
  );
}


/* =========================
   Note Header
   ========================= */

/* The top of a note: its icon, title and details (category, description, dates, comments, sub-pages). */
/* Details can be folded per note, and each row shown or hidden in every note (from its icon in */
/* the toolbar); they can only be edited while the note is unlocked. */
export function NoteHeader({ note, locked, onOpenNote, onOpenWorkItem }: NoteHeaderProps) {
  const categories = useCategories();
  const notes = useNotes();
  const board = useBoard();
  const { spaces, hiddenDetails } = usePreferences();
  const headerRef = useRef<HTMLDivElement>(null);

  /* The work items this note is linked to (links are made from the work item, in Boardspace). */
  const work = spaces.boardspace && onOpenWorkItem ? board.items.filter(item => item.notes?.includes(note.id)) : [];
  const pageCount = countPages(notes, note.id);

  /* The notes whose text links to or mentions this one. */
  const linkedFrom = useMemo(() => notesLinkingTo(notes, note.id), [notes, note.id]);
  const [picking, setPicking] = useState(false);

  /* An empty description or remarks has no row, so the note's text starts closer to its title: */
  /* its icon brings the row in, ready to type, and it stays while this note is open (or until */
  /* its icon is clicked again). A locked note only shows the ones that have something. */
  const [adding, setAdding] = useState<{ description: boolean; remarks: boolean }>({ description: false, remarks: false });
  useEffect(() => setAdding({ description: false, remarks: false }), [note.id]);

  /* Only comments whose words are still in the note are counted. */
  const comments = note.comments.filter(comment => note.content.includes(`data-comment="${comment.id}"`)).length;

  /* Whether this note has anything for a row: the rows for comments, work, links to it and */
  /* sub-notes only come (with their icons) when there is something to list. */
  const has: Record<DetailRow, boolean> = {
    category: true,
    description: Boolean(note.subtitle) || adding.description,
    created: true,
    comments: comments > 0,
    work: work.length > 0,
    linkedFrom: linkedFrom.length > 0,
    remarks: Boolean(note.remarks) || adding.remarks,
    subNotes: pageCount > 0
  };
  const offered = DETAIL_ROWS.filter(row => row === 'description' || row === 'remarks' || has[row]);
  const shown = (row: DetailRow) => has[row] && !hiddenDetails.includes(row);
  const empty = (row: DetailRow) => (row === 'description' && !note.subtitle) || (row === 'remarks' && !note.remarks);

  /* Text fields save after a short pause, like typing in the note itself. */
  const changeText = (changes: Partial<Pick<Note, 'title' | 'subtitle'>>) => {
    updateNote(note.id, changes, false);
    scheduleSave();
  };

  const pick = (icon: string) => {
    updateNote(note.id, { icon });
    setPicking(false);
  };

  /* A row's icon hides a showing row (in every note; an empty description or remarks just goes */
  /* away again), or shows it, unfolding the details. An empty description or remarks then opens */
  /* ready to type. */
  function toggleRow(row: DetailRow) {
    if (!note.detailsHidden && shown(row)) {
      if (empty(row)) setAdding(current => ({ ...current, [row]: false }));
      else setDetailShown(row, false);
      return;
    }
    if (hiddenDetails.includes(row)) setDetailShown(row, true);
    if (note.detailsHidden) updateNote(note.id, { detailsHidden: false });
    if (row !== 'description' && row !== 'remarks') return;
    setAdding(current => ({ ...current, [row]: true }));
    if (!empty(row)) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const header = headerRef.current;
      if (row === 'description') {
        header?.querySelector<HTMLButtonElement>('.note-description')?.click();
        return;
      }
      const remarks = header?.querySelector<HTMLElement>('.note-remarks');
      if (!remarks || document.activeElement === remarks) return;
      remarks.focus({ preventScroll: true });
      placeCaret(remarks.lastElementChild ?? remarks, true);
    }));
  }

  const rowTools = offered.map(row => ({
    row,
    visible: !note.detailsHidden && shown(row),
    disabled: locked && empty(row)
  }));

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
    <div className="note-header" ref={headerRef}>
      <NoteToolbar note={note} locked={locked} rows={rowTools} canFold={offered.some(shown)} onIcon={() => setPicking(true)} onToggle={toggleRow} />

      {note.icon && (
        <button type="button" className="note-icon" aria-label="Change icon" disabled={locked} onClick={() => setPicking(true)}>
          {note.icon}
        </button>
      )}

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

      {!note.detailsHidden && offered.some(shown) && (
        <dl className="note-details">
          {shown('category') && (
            <DetailLine row="category">
              <Dropdown
                label="Category"
                className="note-detail-field note-detail-dropdown"
                wrapperClassName="note-detail-dropdown-wrap"
                disabled={locked}
                value={note.category}
                options={[{ value: '', label: 'None' }, ...categories.map(category => ({ value: category.id, label: category.name, icon: 'folder' as const }))]}
                onChange={category => updateNote(note.id, { category })}
              />
            </DetailLine>
          )}

          {shown('description') && (
            <DetailLine row="description">
              <DescriptionField note={note} locked={locked} startOpen={adding.description && !note.subtitle} onChange={subtitle => changeText({ subtitle })} />
            </DetailLine>
          )}

          {shown('created') && <DetailLine row="created">{formatDate(note.createdAt)}</DetailLine>}

          {/* How many comments are on the note's text (the speech-bubble markers beside the lines). */}
          {shown('comments') && <DetailLine row="comments">{comments} {comments === 1 ? 'comment' : 'comments'}</DetailLine>}

          {shown('work') && (
            <DetailLine row="work" cellClass="note-work">
              {work.map(item => (
                <button key={item.id} type="button" className="note-work-item" onClick={() => onOpenWorkItem?.(item)}>
                  <WorkTypeIcon type={item.type} />
                  {item.name}
                </button>
              ))}
            </DetailLine>
          )}

          {shown('linkedFrom') && (
            <DetailLine row="linkedFrom" cellClass="note-work note-backlinks">
              {linkedFrom.map(source => (
                <button key={source.id} type="button" className="note-work-item" data-preview-page={source.id} onClick={event => onOpenNote(source.id, opensNewTab(event))}>
                  {source.icon ? <span className="note-page-icon" aria-hidden="true">{source.icon}</span> : <Icon name={noteIcon(source)} size={14} />}
                  {noteTitle(source)}
                </button>
              ))}
            </DetailLine>
          )}

          {shown('remarks') && (
            <DetailLine row="remarks" labelClass="note-remarks-label" cellClass="note-remarks-cell">
              <RemarksField note={note} locked={locked} autoFocus={adding.remarks && !note.remarks} />
            </DetailLine>
          )}

          {/* The Sub-notes row only shows when the note has sub-pages. The list can be folded on its */}
          {/* own, so the other details stay visible. */}
          {shown('subNotes') && (
            <DetailLine row="subNotes" labelClass="note-pages-label" cellClass="note-pages">
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
            </DetailLine>
          )}
        </dl>
      )}
    </div>
  );
}
