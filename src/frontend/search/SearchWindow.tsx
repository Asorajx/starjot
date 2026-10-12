import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Dropdown, type DropdownOption } from '../components/Dropdown';
import { Icon, type IconName } from '../components/Icon';
import { useEscape } from '../lib/useDismiss';
import { cleanHtml, htmlToText } from '../notespace/sanitize';
import { ancestorsOf, categoryName, getNote, useCategories, useNotes } from '../notespace/store';
import { BOARD_TABS } from '../workboard/data';
import { TASKS } from '../../backend/data/sampleTasks';
import type { Note } from '../../shared/types/note';
import type { StatusTab, Task } from '../../shared/types/task';
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
  onOpenBoardView: (view: StatusTab) => void;

  /* "Create new note": the title (empty for an untitled note) and the category to start in. */
  onCreateNote: (title: string, category: string, inNewTab: boolean) => void;
};

/* How many recently opened notes show before anything is typed, and how many notes match at most. */
const RECENT_COUNT = 20;
const RESULT_COUNT = 50;

/* The preview waits this long after the selection moves, so moving quickly through results does */
/* not draw every note on the way. A skeleton shows meanwhile. */
const PREVIEW_DELAY = 120;

const KIND_ICONS: Record<SearchEntry['kind'], IconName> = { note: 'file-text', category: 'folder', task: 'check-square' };

/* Which column each Workboard item is in. */
const TASK_COLUMNS = new Map<string, { task: Task; column: StatusTab }>(
  (Object.keys(TASKS) as StatusTab[]).flatMap(column => TASKS[column].map(task => [task.id, { task, column }] as const))
);

function columnLabel(column: StatusTab) {
  return BOARD_TABS.find(view => view.id === column)?.label ?? column;
}


/* =========================
   Search Entries
   ========================= */

function noteEntry(note: Note): SearchEntry {
  const text = [note.subtitle, htmlToText(note.content), htmlToText(note.remarks ?? ''), ...(note.comments ?? []).map(comment => comment.text)];
  return {
    kind: 'note',
    id: note.id,
    title: note.title || 'Untitled note',
    icon: note.icon,
    path: [categoryName(note.category), ...ancestorsOf(note.id).map(parent => parent.title || 'Untitled note')].filter(Boolean),
    text: text.filter(Boolean).join('\n'),
    scope: note.category,
    updatedAt: note.updatedAt ?? ''
  };
}

/* Everything search can find, made again when notes or categories change. */
function useEntries() {
  const notes = useNotes();
  const categories = useCategories();
  return useMemo(() => [
    ...notes.map(noteEntry),
    ...categories.map((category): SearchEntry => ({ kind: 'category', id: category.id, title: category.name, path: ['Category'], text: '', scope: category.id, updatedAt: '' })),
    ...[...TASK_COLUMNS.values()].map(({ task, column }): SearchEntry => ({
      kind: 'task',
      id: task.id,
      title: task.title,
      path: ['Workboard', columnLabel(column)],
      text: [task.id, ...task.tags, task.description, task.person].join('\n'),
      scope: 'workboard',
      updatedAt: ''
    }))
  ], [notes, categories]);
}

type Group = { label: string; results: SearchResult[] };

/* Before anything is typed: recently opened notes by day. After: notes, categories, then */
/* Workboard items, each best first. */
function useGroups(entries: SearchEntry[], query: string, titleOnly: boolean, scope: string): Group[] {
  const notes = useNotes();
  return useMemo(() => {
    if (!query.trim()) {
      const byId = new Map(entries.map(entry => [entry.id, entry]));
      const recent = notes
        .filter(note => note.openedAt)
        .sort((a, b) => (b.openedAt ?? '').localeCompare(a.openedAt ?? ''))
        .slice(0, RECENT_COUNT);
      const groups: Group[] = [];
      for (const note of recent) {
        const label = dayGroup(note.openedAt ?? '');
        const entry = byId.get(note.id);
        if (!entry) continue;
        if (groups[groups.length - 1]?.label !== label) groups.push({ label, results: [] });
        groups[groups.length - 1].results.push({ entry, snippet: null, findTerm: '' });
      }
      return groups;
    }
    const results = search(entries, query, { titleOnly, scope });
    return [
      { label: 'Notes', results: results.filter(result => result.entry.kind === 'note').slice(0, RESULT_COUNT) },
      { label: 'Categories', results: results.filter(result => result.entry.kind === 'category') },
      { label: 'Workboard', results: results.filter(result => result.entry.kind === 'task') }
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
/* a Workboard item's details. Note text is sanitized again before it is shown. */
function Preview({ entry }: { entry: SearchEntry }) {
  const notes = useNotes();
  if (entry.kind === 'note') {
    const note = getNote(entry.id);
    if (!note) return null;
    return (
      <article className="search-preview-page">
        <span className="search-preview-icon" aria-hidden="true">{note.icon || <Icon name="file-text" size={28} />}</span>
        <h2>{note.title || 'Untitled note'}</h2>
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
        <ul className="search-preview-list">{inside.slice(0, 8).map(note => <li key={note.id}>{note.icon ? `${note.icon} ` : ''}{note.title || 'Untitled note'}</li>)}</ul>
      </article>
    );
  }
  const found = TASK_COLUMNS.get(entry.id);
  if (!found) return null;
  const { task, column } = found;
  return (
    <article className="search-preview-page">
      <span className="search-preview-icon" aria-hidden="true"><Icon name="check-square" size={28} /></span>
      <h2>{task.title}</h2>
      <p className="search-preview-subtitle">{task.id} · {columnLabel(column)} · {task.priority} priority</p>
      <p>{task.description}</p>
      <dl className="search-preview-facts">
        <dt>Assignee</dt><dd>{task.person}</dd>
        <dt>Due</dt><dd>{task.date}</dd>
        <dt>Tags</dt><dd>{task.tags.join(', ')}</dd>
      </dl>
    </article>
  );
}

/* The note "Create new note" would make, before it exists. */
function CreatePreview({ title, inNewTab }: { title: string; inNewTab: boolean }) {
  return (
    <article className="search-preview-page">
      <span className="search-preview-icon" aria-hidden="true"><Icon name="plus" size={28} /></span>
      <h2>{title || 'Untitled note'}</h2>
      <p className="search-preview-empty">Press Enter to create this note{inNewTab ? ' in a new tab' : ''}.</p>
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

/* Search across notes, categories and Workboard items, below the note bar and over the page. */
/* Results are on the left and a preview of the selected one on the right; the last row creates a */
/* new note titled with what was typed. ↑ and ↓ move through the rows, Enter opens one (Ctrl + */
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
  const categories = useCategories();
  const entries = useEntries();
  const groups = useGroups(entries, query, titleOnly, scope);
  const flat = groups.flatMap(group => group.results);

  /* The rows are the results, then "Create new note" (its index is flat.length). */
  const rowCount = flat.length + 1;
  const index = Math.min(selected, rowCount - 1);
  const current = flat[index] ?? null;
  const creating = index === flat.length;
  const newTitle = query.trim().slice(0, 160);

  /* A note created while searching in one category starts in it. */
  const newCategory = categories.some(category => category.id === scope) ? scope : '';
  const scopeOptions: DropdownOption<string>[] = [
    { value: 'all', label: 'Everything', icon: 'search' },
    { value: 'notes', label: 'All notes', icon: 'book-open' },
    ...categories.map((category, at) => ({ value: category.id, label: category.name, icon: 'folder' as const, heading: at === 0 ? 'Categories' : undefined })),
    { value: 'workboard', label: 'Workboard', icon: 'layout-dashboard', divider: true }
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
      const found = TASK_COLUMNS.get(entry.id);
      if (found) onOpenBoardView(found.column);
    }
  }

  function create(newTab: boolean) {
    onClose();
    onCreateNote(newTitle, newCategory, newTab);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setSelected((index + step + rowCount) % rowCount);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const newTab = event.ctrlKey || event.metaKey;
      if (current) open(current, newTab);
      else create(newTab);
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
            aria-label="Search notes, categories and Workboard"
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
          <button type="button" className="window-control" aria-label="Close search" data-tooltip="Close (Esc)" data-tooltip-align="end" onClick={onClose}>
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
              <p className="search-empty">{query.trim() ? `Nothing matches “${query.trim()}”.` : 'Notes you open will show here.'}</p>
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
                      onClick={(event: MouseEvent) => open(result, event.ctrlKey || event.metaKey)}
                    >
                      <span className="search-result-icon" aria-hidden="true">{entry.icon || <Icon name={KIND_ICONS[entry.kind]} size={16} />}</span>
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

            <div role="group" aria-label="New note" className="search-create-group">
              <div
                id={`search-option-${flat.length}`}
                role="option"
                aria-selected={creating}
                className={`search-result search-create ${creating ? 'is-selected' : ''}`}
                onMouseMove={() => !creating && setSelected(flat.length)}
                onClick={(event: MouseEvent) => create(event.ctrlKey || event.metaKey)}
              >
                <span className="search-result-icon" aria-hidden="true"><Icon name="plus" size={16} /></span>
                <span className="search-result-text">
                  <span className="search-result-line">
                    <strong>{newTitle ? `Create note “${newTitle}”` : 'Create new note'}</strong>
                    {newCategory && <span className="search-result-path"> — in {categories.find(category => category.id === newCategory)?.name}</span>}
                  </span>
                </span>
              </div>
            </div>
          </div>
          {showPreview && (creating ? <aside className="search-preview" aria-label="Preview"><CreatePreview title={newTitle} inNewTab={inNewTab} /></aside> : <PreviewPane entry={current?.entry ?? null} />)}
        </div>
      </div>
    </div>
  );
}
