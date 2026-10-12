import { useSyncExternalStore } from 'react';
import { cleanHtml, htmlToText } from './sanitize';
import { normalizeDrawing, normalizeLayers } from './editor/drawing';
import { DEFAULT_CATEGORIES, MAX_CATEGORIES } from '../../backend/data/defaultCategories';
import { SAMPLE_CONTENT, SAMPLE_NOTES } from '../../backend/data/sampleNotes';
import { readCategories, writeCategories } from '../../backend/storage/categoriesStorage';
import { readNotes, writeNotes } from '../../backend/storage/notesStorage';
import { isEmoji } from '../../shared/emoji';
import type { Category, Note, NoteAccent, NoteChanges, NoteComment, SaveStatus } from '../../shared/types/note';

/* The frontend's note store: it checks and tidies notes, and tells React when they change. */
/* Saving and loading are done by the backend (backend/storage/notesStorage.ts). */
const MAX_NOTES = 1000;
const SAVE_DELAY = 350;
const ACCENTS: NoteAccent[] = ['indigo', 'mint', 'amber', 'rose'];

const CATEGORY_NAME_LENGTH = 24;

/* A locked note unlocked "for a while" locks itself again after this long without an edit. */
export const TEMPORARY_UNLOCK_MINUTES = 5;
const TEMPORARY_UNLOCK_MS = TEMPORARY_UNLOCK_MINUTES * 60 * 1000;
const REMARKS_LENGTH = 20000;

/* Pages can sit inside pages this many levels deep: a note and its sub-pages, which cannot have */
/* sub-pages of their own. A note can hold any number of sub-pages. */
export const MAX_PAGE_DEPTH = 2;

/* Category names used before categories could be edited, matched to today's default categories. */
const OLD_CATEGORY_NAMES: Record<string, string> = {
  personal: 'personal', projects: 'work', meetings: 'work', work: 'work', knowledge: 'school', school: 'school'
};

type StoreState = {
  notes: Note[];
  categories: Category[];
  saveStatus: SaveStatus;
};

let state: StoreState = { notes: [], categories: [], saveStatus: 'saved' };

/* Ids of deleted sample notes, so they are not added back the next time the app opens. */
let deletedIds: string[] = [];
let storageAvailable = true;
let saveTimer: number | undefined;
const listeners = new Set<() => void>();


/* =========================
   Note Records
   ========================= */

/* Find a note's category id; older notes stored a category name instead of an id. */
function normalizeCategory(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (state.categories.some(category => category.id === text)) return text;
  const byName = state.categories.find(category => category.name.toLowerCase() === text.toLowerCase());
  if (byName) return byName.id;
  const oldMatch = OLD_CATEGORY_NAMES[text.toLowerCase()];
  return state.categories.some(category => category.id === oldMatch) ? oldMatch : '';
}

/* Convert older or incomplete records into the same shape as newly created notes. */
function normalizeNote(raw: unknown): Note | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const id = String(record.id ?? '').slice(0, 90);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;

  const fallback: Partial<Note> = SAMPLE_NOTES.find(note => note.id === id) ?? {};
  const text = (key: keyof Note, defaultValue: string, max: number) => String(record[key] ?? fallback[key] ?? defaultValue).slice(0, max);

  return {
    id,
    title: text('title', 'Untitled note', 160),
    subtitle: text('subtitle', '', 250),
    preview: text('preview', '', 220),
    category: normalizeCategory(record.category ?? fallback.category),
    updated: text('updated', '', 60),
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : null,
    openedAt: typeof record.openedAt === 'string' ? record.openedAt : null,
    date: text('date', '', 40),
    pinned: record.pinned === true,

    /* Older notes stored an icon name such as "layers"; only emoji icons are kept now. */
    icon: isEmoji(String(record.icon ?? '')) ? String(record.icon) : '',
    accent: ACCENTS.includes(record.accent as NoteAccent) ? record.accent as NoteAccent : fallback.accent ?? 'indigo',
    read: text('read', '1 min read', 35),
    mode: record.mode === 'blocks' ? 'blocks' : 'continuous',
    stickyIndicator: record.stickyIndicator !== false,
    layout: record.layout === 'paginated' ? 'paginated' : 'pageless',
    pageSize: record.pageSize === 'letter' ? 'letter' : 'a4',
    landscape: record.landscape === true,
    locked: record.locked === true,
    unlockedUntil: typeof record.unlockedUntil === 'string' && !Number.isNaN(Date.parse(record.unlockedUntil)) ? record.unlockedUntil : null,
    remarks: cleanHtml(String(record.remarks ?? '').slice(0, REMARKS_LENGTH)),
    detailsHidden: record.detailsHidden === true,
    pagesHidden: record.pagesHidden === true,
    parentId: /^[a-zA-Z0-9_-]+$/.test(String(record.parentId ?? '')) ? String(record.parentId) : '',
    comments: normalizeComments(record.comments),
    drawing: normalizeDrawing(record.drawing),
    drawingLayers: normalizeLayers(record.drawingLayers),
    content: cleanHtml(record.content ?? SAMPLE_CONTENT[id] ?? '')
  };
}

function normalizeComments(raw: unknown): NoteComment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(item => item && typeof item === 'object' && /^c[a-z0-9]+$/.test(String(item.id)))
    .map(item => ({ id: String(item.id), text: String(item.text ?? '').slice(0, 2000), createdAt: String(item.createdAt ?? '') }));
}

function normalizeCategories(raw: unknown[] | null): Category[] {
  if (!raw) return DEFAULT_CATEGORIES.map(category => ({ ...category }));
  const seen = new Set<string>();
  return raw.flatMap(item => {
    const record = (item ?? {}) as Record<string, unknown>;
    const id = String(record.id ?? '');
    const name = String(record.name ?? '').trim().slice(0, CATEGORY_NAME_LENGTH);
    if (!/^[a-z0-9_-]+$/i.test(id) || !name || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name }];
  }).slice(0, MAX_CATEGORIES);
}

/* A sub-page whose parent is missing, or a loop of pages inside each other, becomes a top-level note. */
/* A page nested deeper than allowed (saved before the limit was lowered) moves up to sit directly */
/* inside its top-level note, so nothing written in it is lost. */
function repairParents(notes: Note[]) {
  const byId = new Map(notes.map(note => [note.id, note]));
  const fixed = notes.map(note => {
    const seen = new Set([note.id]);
    let parent = byId.get(note.parentId);
    while (parent) {
      if (seen.has(parent.id)) return { ...note, parentId: '' };
      seen.add(parent.id);
      parent = byId.get(parent.parentId);
    }
    return note.parentId && !byId.has(note.parentId) ? { ...note, parentId: '' } : note;
  });

  const fixedById = new Map(fixed.map(note => [note.id, note]));
  return fixed.map(note => {
    let top = fixedById.get(note.parentId);
    while (top?.parentId) top = fixedById.get(top.parentId);
    return top && top.id !== note.parentId ? { ...note, parentId: top.id } : note;
  });
}

function load(): Note[] {
  const seeds = SAMPLE_NOTES.map(normalizeNote).filter((note): note is Note => note !== null);
  try {
    const saved = readNotes();
    if (!saved) return seeds;
    deletedIds = saved.deleted;
    const restored = saved.notes.slice(0, MAX_NOTES).map(normalizeNote).filter((note): note is Note => note !== null);
    const ids = new Set(restored.map((note: Note) => note.id));
    return repairParents([...restored, ...seeds.filter(note => !ids.has(note.id) && !deletedIds.includes(note.id))]);
  } catch (error) {
    storageAvailable = false;
    console.warn('Notespace: browser storage is unavailable; notes will remain in this tab only.', error);
    return seeds;
  }
}


/* =========================
   Store Updates
   ========================= */

/* Every change creates a new state object so React knows to re-render. */
function setState(changes: Partial<StoreState>) {
  state = { ...state, ...changes };
  listeners.forEach(listener => listener());
}

export function save() {
  window.clearTimeout(saveTimer);
  saveTimer = undefined;
  try {
    writeNotes(state.notes, deletedIds);
    writeCategories(state.categories);
    storageAvailable = true;
  } catch (error) {
    storageAvailable = false;
    console.warn('Notespace: could not save notes to browser storage.', error);
  }
  setState({ saveStatus: storageAvailable ? 'saved' : 'unsaved' });
  return storageAvailable;
}

/* Typing saves after a short pause instead of on every key press. */
export function scheduleSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(save, SAVE_DELAY);
  if (state.saveStatus !== 'saving') setState({ saveStatus: 'saving' });
}

/* Write any pending changes immediately, for example before leaving a note. */
export function flushSave() {
  if (saveTimer !== undefined) save();
}

export function getNotes() {
  return state.notes;
}

export function getNote(id: string) {
  return state.notes.find(note => note.id === id);
}

/* A new note can start in a category, for example the one being filtered on the home page. */
/* A sub-page is created inside a parent note and starts in the parent's category. */
export function createNote(category = '', parentId = '') {
  const now = new Date().toISOString();
  const note = normalizeNote({
    id: `note_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    title: 'Untitled note', subtitle: '', preview: '', category, parentId,
    updatedAt: now, createdAt: now, openedAt: now, pinned: false, icon: '',
    accent: 'indigo', mode: 'continuous', content: ''
  }) as Note;
  setState({ notes: [note, ...state.notes] });
  save();
  return note;
}

/* Update one note; pass persist = false to save later with scheduleSave(). */
export function updateNote(id: string, changes: NoteChanges, persist = true) {
  const current = getNote(id);
  if (!current) return null;
  const next: Note = { ...current, updatedAt: new Date().toISOString() };

  if (changes.title !== undefined) next.title = String(changes.title).slice(0, 160);
  if (changes.subtitle !== undefined) next.subtitle = String(changes.subtitle).slice(0, 250);
  if (changes.category !== undefined) next.category = normalizeCategory(changes.category);
  if (changes.icon !== undefined) next.icon = isEmoji(changes.icon) ? changes.icon : '';
  if (typeof changes.detailsHidden === 'boolean') next.detailsHidden = changes.detailsHidden;
  if (typeof changes.pagesHidden === 'boolean') next.pagesHidden = changes.pagesHidden;
  if (changes.content !== undefined) {
    next.content = cleanHtml(changes.content);
    next.preview = htmlToText(next.content).trim().slice(0, 180);
  }
  if (changes.mode === 'continuous' || changes.mode === 'blocks') next.mode = changes.mode;
  if (typeof changes.stickyIndicator === 'boolean') next.stickyIndicator = changes.stickyIndicator;
  if (changes.layout === 'pageless' || changes.layout === 'paginated') next.layout = changes.layout;
  if (changes.pageSize === 'a4' || changes.pageSize === 'letter') next.pageSize = changes.pageSize;
  if (typeof changes.landscape === 'boolean') next.landscape = changes.landscape;
  if (changes.remarks !== undefined) next.remarks = cleanHtml(String(changes.remarks).slice(0, REMARKS_LENGTH));
  if (changes.comments) next.comments = normalizeComments(changes.comments);
  if (changes.drawing) next.drawing = normalizeDrawing(changes.drawing);
  if (changes.drawingLayers) next.drawingLayers = normalizeLayers(changes.drawingLayers);

  /* Locking or unlocking from Page options ends any short unlock. */
  if (typeof changes.locked === 'boolean') {
    next.locked = changes.locked;
    next.unlockedUntil = null;
  }

  /* An edit while the note is unlocked for a short time starts the countdown again. */
  const edits = (['title', 'subtitle', 'category', 'icon', 'content', 'remarks', 'comments', 'drawing', 'drawingLayers'] as const).some(key => changes[key] !== undefined);
  if (edits && isTemporarilyUnlocked(current)) next.unlockedUntil = new Date(Date.now() + TEMPORARY_UNLOCK_MS).toISOString();

  setState({ notes: state.notes.map(note => (note.id === id ? next : note)) });
  if (persist) save();
  return next;
}

/* Pinning is not an edit, so it does not change the note's "last edited" time. */
export function setPinned(id: string, pinned: boolean) {
  setState({ notes: state.notes.map(note => (note.id === id ? { ...note, pinned } : note)) });
  save();
}

/* =========================
   Locking
   ========================= */

/* True while a locked note is unlocked for a short time. */
export function isTemporarilyUnlocked(note: Note, now = Date.now()) {
  return note.locked && Boolean(note.unlockedUntil) && Date.parse(note.unlockedUntil as string) > now;
}

/* Whether the note can be edited right now. */
export function isLocked(note: Note, now = Date.now()) {
  return note.locked && !isTemporarilyUnlocked(note, now);
}

/* Unlock a locked note until it has gone a few minutes without an edit. Not an edit itself. */
export function unlockForAWhile(id: string) {
  const unlockedUntil = new Date(Date.now() + TEMPORARY_UNLOCK_MS).toISOString();
  setState({ notes: state.notes.map(note => (note.id === id ? { ...note, unlockedUntil } : note)) });
  save();
}

/* End a short unlock straight away. */
export function lockNow(id: string) {
  setState({ notes: state.notes.map(note => (note.id === id ? { ...note, unlockedUntil: null } : note)) });
  save();
}

/* Remember when a note was opened. Like starring, this does not count as an edit. */
export function markOpened(id: string) {
  const openedAt = new Date().toISOString();
  setState({ notes: state.notes.map(note => (note.id === id ? { ...note, openedAt } : note)) });
  scheduleSave();
}

/* Remove a note permanently from this browser. Its sub-pages are kept and move up one level. */
export function deleteNote(id: string) {
  const removed = getNote(id);
  if (SAMPLE_NOTES.some(note => note.id === id)) deletedIds = [...deletedIds, id];

  /* The page's card is also taken out of the page it sat in, so no "Note not found" card is left. */
  const withoutCard = (html: string) => {
    const template = document.createElement('template');
    template.innerHTML = html;
    const cards = template.content.querySelectorAll(`.page-block[data-page="${CSS.escape(id)}"]`);
    cards.forEach(card => card.remove());
    return cards.length ? template.innerHTML : html;
  };
  setState({
    notes: state.notes
      .filter(note => note.id !== id)
      .map(note => (note.parentId === id ? { ...note, parentId: removed?.parentId ?? '' } : note))
      .map(note => (note.id === removed?.parentId ? { ...note, content: withoutCard(note.content) } : note))
  });
  save();
}


/* =========================
   Pages Inside Pages
   ========================= */

/* The pages above a note, from the top-level note down to its direct parent. */
export function ancestorsOf(id: string) {
  const ancestors: Note[] = [];
  let parent = getNote(getNote(id)?.parentId ?? '');
  while (parent && ancestors.length < MAX_PAGE_DEPTH) {
    ancestors.unshift(parent);
    parent = getNote(parent.parentId);
  }
  return ancestors;
}

/* 1 for a top-level note, 2 for its sub-page, and so on. */
export function depthOf(id: string) {
  return ancestorsOf(id).length + 1;
}

export function childrenOf(id: string) {
  return state.notes.filter(note => note.parentId === id);
}

export function canAddSubpage(id: string) {
  return Boolean(getNote(id)) && depthOf(id) < MAX_PAGE_DEPTH;
}

/* Move a sub-page up one level, out of the page it sits in. Its own sub-pages stay inside it. */
export function separatePage(id: string) {
  const note = getNote(id);
  const parent = getNote(note?.parentId ?? '');
  if (!note || !parent) return;
  setState({ notes: state.notes.map(item => (item.id === id ? { ...item, parentId: parent.parentId } : item)) });
  save();
}

/* Returns the new sub-page, or null when the parent is already at the deepest level. */
export function createSubpage(parentId: string) {
  const parent = getNote(parentId);
  if (!parent || !canAddSubpage(parentId)) return null;
  return createNote(parent.category, parentId);
}


/* =========================
   Categories
   ========================= */

function cleanCategoryName(name: string) {
  return name.trim().replace(/\s+/g, ' ').slice(0, CATEGORY_NAME_LENGTH);
}

function nameTaken(name: string, exceptId = '') {
  return state.categories.some(category => category.id !== exceptId && category.name.toLowerCase() === name.toLowerCase());
}

export function canAddCategory() {
  return state.categories.length < MAX_CATEGORIES;
}

/* Returns the new category, or null when the limit is reached or the name is empty or taken. */
export function addCategory(name: string) {
  const clean = cleanCategoryName(name);
  if (!canAddCategory() || !clean || nameTaken(clean)) return null;
  const category = { id: `cat_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: clean };
  setState({ categories: [...state.categories, category] });
  save();
  return category;
}

/* Returns false (and keeps the old name) when the new name is empty or already used. */
export function renameCategory(id: string, name: string) {
  const clean = cleanCategoryName(name);
  if (!clean || nameTaken(clean, id)) return false;
  setState({ categories: state.categories.map(category => (category.id === id ? { ...category, name: clean } : category)) });
  save();
  return true;
}

/* Notes in a removed category are kept, but no longer have a category. */
export function removeCategory(id: string) {
  setState({
    categories: state.categories.filter(category => category.id !== id),
    notes: state.notes.map(note => (note.category === id ? { ...note, category: '' } : note))
  });
  save();
}

export function categoryName(id: string) {
  return state.categories.find(category => category.id === id)?.name ?? '';
}


/* =========================
   Labels and Status
   ========================= */

export function updatedLabel(note: Note) {
  if (!note.updatedAt) return note.updated || 'Recently';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(note.updatedAt).getTime()) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
  return new Date(note.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function isStorageAvailable() {
  return storageAvailable;
}


/* =========================
   React Hooks
   ========================= */

/* Call listener after every change to notes or categories; returns a function that stops it. */
export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/* Components re-render automatically when the notes or save status change. */
export function useNotes() {
  return useSyncExternalStore(subscribe, () => state.notes);
}

export function useNote(id: string) {
  return useSyncExternalStore(subscribe, () => getNote(id));
}

export function useCategories() {
  return useSyncExternalStore(subscribe, () => state.categories);
}

export function useSaveStatus() {
  return useSyncExternalStore(subscribe, () => state.saveStatus);
}

/* Load saved categories and notes once, when this module is first imported. */
/* Categories load first, because notes are matched to them. */
state = { notes: [], categories: normalizeCategories(readCategories()), saveStatus: 'saved' };
state = { ...state, notes: load() };
if (!storageAvailable) state.saveStatus = 'unsaved';
