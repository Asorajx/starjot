import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Dropdown, type DropdownOption } from '../components/Dropdown';
import { Icon, type IconName } from '../components/Icon';
import { opensNewTab } from '../lib/clicks';
import { usePreferences, type Spaces } from '../app/preferences';
import { useEscape } from '../lib/useDismiss';
import { cleanHtml, htmlToText } from '../notespace/sanitize';
import { starredNotes } from '../notespace/NoteList';
import { ancestorsOf, categoryName, getNote, noteIcon, noteTitle, useCategories, useNotes } from '../notespace/store';
import { getBoard, useBoard } from '../boardspace/board';
import { dayRange } from '../boardspace/dates';
import { openWorkItem } from '../boardspace/openWork';
import { epicCompletion, shownSprintOf, WORK_STATUSES, WORK_TYPES } from '../boardspace/workItems';
import { TYPE_ICONS } from '../boardspace/workParts';
import type { Note, NoteKind } from '../../shared/types/note';
import type { BoardProject, BoardTab, WorkItem } from '../../shared/types/board';
import { dayGroup, search, type SearchEntry, type SearchResult, type Snippet } from './searchIndex';

type SearchWindowProps = {

  /* Text already typed, such as the key pressed in the sidebar's search box. */
  initialQuery: string;

  /* Opened from a tab group's +: whatever is chosen or created opens in a new tab. */
  inNewTab: boolean;
  onClose: () => void;

  /* inNewTab: Ctrl + Enter or Ctrl + click (the app also opens a new tab when inNewTab was set). */
  /* findTerm: words to show with the find bar. */
  onOpenNote: (id: string, inNewTab: boolean, findTerm: string) => void;
  onOpenCategory: (id: string, inNewTab: boolean) => void;
  onOpenBoardView: (view: BoardTab) => void;

  /* "Create new note" or "Create new canvas": the title (empty for an untitled note), the category */
  /* to start in, and which kind of note. */
  onCreateNote: (title: string, category: string, inNewTab: boolean, kind: NoteKind) => void;
};

/* Before anything is typed: how many starred and recent notes show. And how many notes match at */
/* most once something is typed. */
const STARRED_COUNT = 8;
const RECENT_COUNT = 20;
const RESULT_COUNT = 50;

/* The preview waits this long after the selection moves, so moving quickly through results does */
/* not draw every note on the way. A skeleton shows meanwhile. */
const PREVIEW_DELAY = 120;

const KIND_ICONS: Record<SearchEntry['kind'], IconName> = { note: 'file-text', category: 'folder', task: 'check-square' };

/* The last rows of the results make a new note: a document first, then a canvas. */
const CREATE_KINDS: NoteKind[] = ['document', 'canvas'];

/* A work item's sprint name, or Backlog. */
function sprintName(board: BoardProject, item: WorkItem) {
  return board.sprints.find(sprint => sprint.id === shownSprintOf(board, item))?.name ?? 'Backlog';
}

/* A work item's kind and status (an epic's task progress instead). */
function workState(board: BoardProject, item: WorkItem) {
  if (item.type !== 'epic') return `${WORK_TYPES[item.type].label} · ${WORK_STATUSES[item.status]}`;
  const { done, total } = epicCompletion(board.items, item.id);
  return `Epic · ${done} of ${total} tasks done`;
}


/* =========================
   Search Entries
   ========================= */

function noteEntry(note: Note): SearchEntry {
  const text = [note.subtitle, htmlToText(note.content), htmlToText(note.remarks ?? ''), ...(note.comments ?? []).map(comment => comment.text)];
  return {
    kind: 'note',
    id: note.id,
    title: noteTitle(note),
    icon: note.icon,
    path: [categoryName(note.category), ...ancestorsOf(note.id).map(parent => noteTitle(parent))].filter(Boolean),
    text: text.filter(Boolean).join('\n'),
    scope: note.category,
    updatedAt: note.updatedAt ?? ''
  };
}

/* Everything search can find in the spaces turned on, made again when notes, categories or the */
/* Boardspace project change. Work items match on their name, kind, status, assignee and parent. */
function useEntries(spaces: Spaces) {
  const notes = useNotes();
  const categories = useCategories();
  const board = useBoard();
  return useMemo(() => [
    ...(spaces.notes ? notes.map(noteEntry) : []),
    ...(spaces.notes ? categories.map((category): SearchEntry => ({ kind: 'category', id: category.id, title: category.name, path: ['Category'], text: '', scope: category.id, updatedAt: '' })) : []),
    ...(spaces.boardspace ? board.items : []).map((item): SearchEntry => ({
      kind: 'task',
      id: item.id,
      title: item.name,
      path: ['Boardspace', sprintName(board, item)],
      text: [workState(board, item), item.assignee, board.items.find(parent => parent.id === item.parentId)?.name ?? ''].filter(Boolean).join('\n'),
      scope: 'boardspace',
      updatedAt: ''
    }))
  ], [notes, categories, board, spaces]);
}

type Group = { label: string; results: SearchResult[] };

/* Before anything is typed: starred notes, then the most recent notes by day (when they were */
/* last opened, or last edited for notes never opened here), each note once (nothing while */
/* Notespace is turned off). After: notes, categories, then Boardspace items, each best first. */
function useGroups(entries: SearchEntry[], query: string, titleOnly: boolean, scope: string, withNotes: boolean): Group[] {
  const allNotes = useNotes();
  const notes = withNotes ? allNotes : [];
  return useMemo(() => {
    if (!query.trim()) {
      const byId = new Map(entries.map(entry => [entry.id, entry]));
      const resultFor = (note: Note): SearchResult[] => {
        const entry = byId.get(note.id);
        return entry ? [{ entry, snippet: null, findTerm: '' }] : [];
      };
      const starred = starredNotes(notes).slice(0, STARRED_COUNT);
      const lastSeen = (note: Note) => note.openedAt ?? note.updatedAt ?? '';
      const recent = notes
        .filter(note => !note.pinned)
        .sort((a, b) => lastSeen(b).localeCompare(lastSeen(a)))
        .slice(0, RECENT_COUNT);
      const groups: Group[] = starred.length ? [{ label: 'Starred', results: starred.flatMap(resultFor) }] : [];
      for (const note of recent) {
        const label = dayGroup(lastSeen(note));
        if (groups[groups.length - 1]?.label !== label) groups.push({ label, results: [] });
        groups[groups.length - 1].results.push(...resultFor(note));
      }
      return groups;
    }
    const results = search(entries, query, { titleOnly, scope });
    return [
      { label: 'Notes', results: results.filter(result => result.entry.kind === 'note').slice(0, RESULT_COUNT) },
      { label: 'Categories', results: results.filter(result => result.entry.kind === 'category') },
      { label: 'Boardspace', results: results.filter(result => result.entry.kind === 'task') }
    ].filter(group => group.results.length);
  }, [entries, notes, query, titleOnly, scope]);
}


/* =========================
   Preview
   ========================= */

function SnippetText({ snippet }: { snippet: Snippet }) {
  return <span className="search-result-snippet">{snippet.before}<mark>{snippet.match}</mark>{snippet.after}</span>;
}

/* Grey blocks in the shape of a note, shown while the preview is drawn. */
function PreviewSkeleton() {
  return (
    <div className="search-skeleton" aria-hidden="true">
      <span className="search-skeleton-icon" />
      <span className="search-skeleton-title" />
      {[92, 100, 84, 96, 60].map((width, index) => <span key={index} className="search-skeleton-line" style={{ width: `${width}%` }} />)}
    </div>
  );
}

/* The selected result as a read-only page: a note with its text, a category with its notes, or */
/* a Boardspace item's details. Note text is sanitized again before it is shown. */
function Preview({ entry }: { entry: SearchEntry }) {
  const notes = useNotes();
  const board = useBoard();
  if (entry.kind === 'note') {
    const note = getNote(entry.id);
    if (!note) return null;
    return (
      <article className="search-preview-page">
        <span className="search-preview-icon" aria-hidden="true">{note.icon || <Icon name={noteIcon(note)} size={28} />}</span>
        <h2>{noteTitle(note)}</h2>
        {note.subtitle && <p className="search-preview-subtitle">{note.subtitle}</p>}
        {note.content
          ? <div className="search-preview-content" dangerouslySetInnerHTML={{ __html: cleanHtml(note.content) }} />
          : <p className="search-preview-empty">This note has no text yet.</p>}
      </article>
    );
  }
  if (entry.kind === 'category') {
    const inside = notes.filter(note => note.category === entry.id);
    return (
      <article className="search-preview-page">
        <span className="search-preview-icon" aria-hidden="true"><Icon name="folder" size={28} /></span>
        <h2>{entry.title}</h2>
        <p className="search-preview-subtitle">{inside.length} {inside.length === 1 ? 'note' : 'notes'}</p>
        <ul className="search-preview-list">{inside.slice(0, 8).map(note => <li key={note.id}>{note.icon ? `${note.icon} ` : ''}{noteTitle(note)}</li>)}</ul>
      </article>
    );
  }
  const item = board.items.find(work => work.id === entry.id);
  if (!item) return null;
  const parent = board.items.find(work => work.id === item.parentId);
  return (
    <article className="search-preview-page">
      <span className="search-preview-icon" aria-hidden="true"><Icon name={TYPE_ICONS[item.type]} size={28} /></span>
      <h2>{item.name}</h2>
      <p className="search-preview-subtitle">{workState(board, item)}</p>
      <dl className="search-preview-facts">
        <dt>Assignee</dt><dd>{item.assignee || 'Unassigned'}</dd>
        <dt>Sprint</dt><dd>{sprintName(board, item)}</dd>
        <dt>Dates</dt><dd>{dayRange(item.start, item.end)}</dd>
        {parent && <><dt>Inside</dt><dd>{parent.name}</dd></>}
      </dl>
    </article>
  );
}

/* The note "Create new note" (or canvas) would make, before it exists. */
function CreatePreview({ title, kind, inNewTab }: { title: string; kind: NoteKind; inNewTab: boolean }) {
  return (
    <article className="search-preview-page">
      <span className="search-preview-icon" aria-hidden="true"><Icon name={noteIcon({ kind })} size={28} /></span>
      <h2>{noteTitle({ title })}</h2>
      <p className="search-preview-empty">Press Enter to create this {kind === 'canvas' ? 'canvas' : 'note'}{inNewTab ? ' in a new tab' : ''}.</p>
    </article>
  );
}

/* Shows the skeleton first whenever the selection changes, then the page. */
function PreviewPane({ entry }: { entry: SearchEntry | null }) {
  const [shownId, setShownId] = useState<string | null>(null);
  const key = entry ? `${entry.kind}:${entry.id}` : null;
  useEffect(() => {
    const timer = window.setTimeout(() => setShownId(key), PREVIEW_DELAY);
    return () => window.clearTimeout(timer);
  }, [key]);

  return (
    <aside className="search-preview" aria-label="Preview">
      {!entry
        ? <p className="search-preview-empty">Nothing selected.</p>
        : shownId === key ? <Preview entry={entry} /> : <PreviewSkeleton />}
    </aside>
  );
}


/* =========================
   Search Window
   ========================= */

/* Search across notes, categories and Boardspace items, below the note bar and over the page. */
/* Results are on the left and a preview of the selected one on the right; the last row creates a */
/* new note (or canvas) titled with what was typed. ↑ and ↓ move through the rows, Enter opens one (Ctrl + */
/* Enter in a new tab), and Escape closes. Opened from a tab group's +, everything opens in a new */
/* tab. */
export function SearchWindow({ initialQuery, inNewTab, onClose, onOpenNote, onOpenCategory, onOpenBoardView, onCreateNote }: SearchWindowProps) {
  const [query, setQuery] = useState(initialQuery);
  const [titleOnly, setTitleOnly] = useState(false);
  const [scope, setScope] = useState('all');
  const [showPreview, setShowPreview] = useState(true);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { spaces } = usePreferences();
  const allCategories = useCategories();
  const categories = spaces.notes ? allCategories : [];
  const entries = useEntries(spaces);
  const groups = useGroups(entries, query, titleOnly, scope, spaces.notes);
  const flat = groups.flatMap(group => group.results);

  /* The rows are the results, then "Create new note" and "Create new canvas" (their indexes are */
  /* flat.length and the one after), which need Notespace to be turned on. */
  const canCreate = spaces.notes;
  const rowCount = flat.length + (canCreate ? CREATE_KINDS.length : 0);
  const index = Math.max(0, Math.min(selected, rowCount - 1));
  const current = flat[index] ?? null;
  const creating = canCreate && index >= flat.length ? CREATE_KINDS[index - flat.length] : null;
  const newTitle = query.trim().slice(0, 160);

  /* A note created while searching in one category starts in it. */
  const newCategory = categories.some(category => category.id === scope) ? scope : '';
  const scopeOptions: DropdownOption<string>[] = [
    { value: 'all', label: 'Everything', icon: 'search' },
    ...(spaces.notes ? [{ value: 'notes', label: 'All notes', icon: 'book-open' as const }] : []),
    ...categories.map((category, at) => ({ value: category.id, label: category.name, icon: 'folder' as const, heading: at === 0 ? 'Categories' : undefined })),
    ...(spaces.boardspace ? [{ value: 'boardspace', label: 'Boardspace', icon: 'layout-dashboard' as const, divider: spaces.notes }] : [])
  ];

  useEscape(true, onClose);

  /* Focus the box as the window opens, with the cursor after any text already typed, and give */
  /* focus back to where it was when the window closes. */
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const input = inputRef.current;
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
    return () => before?.focus?.();
  }, []);

  useEffect(() => setSelected(0), [query, titleOnly, scope]);

  /* Keep the selected result in view while moving with the arrow keys. */
  useEffect(() => {
    listRef.current?.querySelector(`#search-option-${index}`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  function open(result: SearchResult, newTab: boolean) {
    const { entry } = result;
    onClose();
    if (entry.kind === 'note') onOpenNote(entry.id, newTab, result.findTerm);
    else if (entry.kind === 'category') onOpenCategory(entry.id, newTab);
    else {

      /* A work item opens in the editor, over the Board (or the List for an epic, which the */
      /* board leaves out). */
      const item = getBoard().items.find(work => work.id === entry.id);
      if (!item) return;
      onOpenBoardView(item.type === 'epic' ? 'list' : 'board');
      openWorkItem(item.id);
    }
  }

  function create(kind: NoteKind, newTab: boolean) {
    onClose();
    onCreateNote(newTitle, newCategory, newTab, kind);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setSelected((index + step + rowCount) % rowCount);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const newTab = opensNewTab(event);
      if (current) open(current, newTab);
      else if (creating) create(creating, newTab);
    }
  }

  let position = -1;

  return (
    <div className="search-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="search-window" role="dialog" aria-modal="true" aria-label={inNewTab ? 'Open in a new tab' : 'Search'}>
        <div className="search-head">
          <Icon name="search" size={20} />
          <input
            ref={inputRef}
            className="search-input"
            type="search"
            role="combobox"
            aria-label="Search notes, categories and Boardspace"
            aria-expanded="true"
            aria-controls="search-results"
            aria-activedescendant={`search-option-${index}`}
            aria-autocomplete="list"
            placeholder={inNewTab ? 'Open in a new tab…' : 'Search everything…'}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            className="window-control search-preview-toggle"
            aria-label={showPreview ? 'Hide preview' : 'Show preview'}
            aria-pressed={showPreview}
            data-tooltip={showPreview ? 'Hide preview' : 'Show preview'}
            data-tooltip-align="end"
            onClick={() => setShowPreview(value => !value)}
          >
            <Icon name="panels-top-left" size={18} />
          </button>
          <button type="button" className="window-control" aria-label="Close search" data-tooltip="Close" data-shortcut="Esc" data-tooltip-align="end" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="search-filters">
          <button type="button" className={`search-filter ${titleOnly ? 'is-active' : ''}`} aria-pressed={titleOnly} onClick={() => setTitleOnly(value => !value)}>
            <Icon name="type" size={14} /> Title only
          </button>
          <Dropdown
            label="Search in"
            prefix="In"
            className={`search-filter ${scope !== 'all' ? 'is-active' : ''}`}
            value={scope}
            options={scopeOptions}
            onChange={setScope}
          />
        </div>

        <div className={`search-body ${showPreview ? 'has-preview' : ''}`}>
          <div className="search-results" id="search-results" role="listbox" aria-label="Results" ref={listRef}>
            {!flat.length && (
              <p className="search-empty">{query.trim() ? `Nothing matches “${query.trim()}”.` : spaces.notes ? 'Notes you write will show here.' : 'Type to search Boardspace.'}</p>
            )}
            {groups.map(group => (
              <div key={group.label} role="group" aria-label={group.label}>
                <div className="search-group-label" aria-hidden="true">{group.label}</div>
                {group.results.map(result => {
                  position += 1;
                  const at = position;
                  const { entry } = result;
                  return (
                    <div
                      key={`${entry.kind}:${entry.id}`}
                      id={`search-option-${at}`}
                      role="option"
                      aria-selected={at === index}
                      className={`search-result ${at === index ? 'is-selected' : ''}`}
                      onMouseMove={() => at !== index && setSelected(at)}
                      onClick={(event: MouseEvent) => open(result, opensNewTab(event))}
                    >
                      <span className="search-result-icon" aria-hidden="true">{entry.icon || <Icon name={entry.kind === 'note' ? noteIcon(getNote(entry.id)) : KIND_ICONS[entry.kind]} size={16} />}</span>
                      <span className="search-result-text">
                        <span className="search-result-line">
                          <strong>{entry.title}</strong>
                          {entry.path.length > 0 && <span className="search-result-path"> — {entry.path.join(' / ')}</span>}
                        </span>
                        {result.snippet && <SnippetText snippet={result.snippet} />}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}

            {canCreate && <div role="group" aria-label="New note" className="search-create-group">
              {CREATE_KINDS.map((kind, offset) => {
                const at = flat.length + offset;
                const word = kind === 'canvas' ? 'canvas' : 'note';
                return (
                  <div
                    key={kind}
                    id={`search-option-${at}`}
                    role="option"
                    aria-selected={at === index}
                    className={`search-result search-create ${at === index ? 'is-selected' : ''}`}
                    onMouseMove={() => at !== index && setSelected(at)}
                    onClick={(event: MouseEvent) => create(kind, opensNewTab(event))}
                  >
                    <span className="search-result-icon" aria-hidden="true"><Icon name={offset ? noteIcon({ kind }) : 'plus'} size={16} /></span>
                    <span className="search-result-text">
                      <span className="search-result-line">
                        <strong>{newTitle ? `Create ${word} “${newTitle}”` : `Create new ${word}`}</strong>
                        {newCategory && <span className="search-result-path"> — in {categories.find(category => category.id === newCategory)?.name}</span>}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>}
          </div>
          {showPreview && (creating ? <aside className="search-preview" aria-label="Preview"><CreatePreview title={newTitle} kind={creating} inNewTab={inNewTab} /></aside> : <PreviewPane entry={current?.entry ?? null} />)}
        </div>
      </div>
    </div>
  );
}
