import { useSyncExternalStore } from 'react';
import { cleanHtml, htmlToText } from './sanitize';
import { SAMPLE_CONTENT, SAMPLE_NOTES } from '../../backend/data/sampleNotes';
import { readNotes, writeNotes } from '../../backend/storage/notesStorage';
import type { Note, NoteAccent, NoteChanges, NoteComment, SaveStatus } from '../../shared/types/note';

/* The frontend's note store: it checks and tidies notes, and tells React when they change. */
/* Saving and loading are done by the backend (backend/storage/notesStorage.ts). */
const MAX_NOTES = 1000;
const SAVE_DELAY = 350;
const ACCENTS: NoteAccent[] = ['indigo', 'mint', 'amber', 'rose'];

type StoreState = {
  notes: Note[];
  saveStatus: SaveStatus;
};

let state: StoreState = { notes: [], saveStatus: 'saved' };

/* Ids of deleted sample notes, so they are not added back the next time the app opens. */
let deletedIds: string[] = [];
let storageAvailable = true;
let saveTimer: number | undefined;
const listeners = new Set<() => void>();


/* =========================
   Note Records
   ========================= */

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
    subtitle: text('subtitle', 'Notes, context and working ideas.', 250),
    preview: text('preview', '', 220),
    category: text('category', 'Personal', 50),
    updated: text('updated', '', 60),
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : null,
    date: text('date', '', 40),
    pinned: record.pinned === true,
    icon: text('icon', 'file-text', 35),
    accent: ACCENTS.includes(record.accent as NoteAccent) ? record.accent as NoteAccent : fallback.accent ?? 'indigo',
    read: text('read', '1 min read', 35),
    mode: record.mode === 'blocks' ? 'blocks' : 'continuous',
    stickyIndicator: record.stickyIndicator !== false,
    locked: record.locked === true,
    comments: normalizeComments(record.comments),
    content: cleanHtml(record.content ?? SAMPLE_CONTENT[id] ?? '')
  };
}

function normalizeComments(raw: unknown): NoteComment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(item => item && typeof item === 'object' && /^c[a-z0-9]+$/.test(String(item.id)))
    .map(item => ({ id: String(item.id), text: String(item.text ?? '').slice(0, 2000), createdAt: String(item.createdAt ?? '') }));
}

function load(): Note[] {
  const seeds = SAMPLE_NOTES.map(normalizeNote).filter((note): note is Note => note !== null);
  try {
    const saved = readNotes();
    if (!saved) return seeds;
    deletedIds = saved.deleted;
    const restored = saved.notes.slice(0, MAX_NOTES).map(normalizeNote).filter((note): note is Note => note !== null);
    const ids = new Set(restored.map((note: Note) => note.id));
    return [...restored, ...seeds.filter(note => !ids.has(note.id) && !deletedIds.includes(note.id))];
  } catch (error) {
    storageAvailable = false;
    console.warn('Notespace: browser storage is unavailable; notes will remain in this page only.', error);
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

export function getNote(id: string) {
  return state.notes.find(note => note.id === id);
}

export function createNote() {
  const now = new Date().toISOString();
  const note = normalizeNote({
    id: `note_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    title: 'Untitled note', subtitle: '', preview: '', category: 'Personal',
    updatedAt: now, createdAt: now, pinned: false, icon: 'file-text',
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
  if (changes.content !== undefined) {
    next.content = cleanHtml(changes.content);
    next.preview = htmlToText(next.content).trim().slice(0, 180);
  }
  if (changes.mode === 'continuous' || changes.mode === 'blocks') next.mode = changes.mode;
  if (typeof changes.stickyIndicator === 'boolean') next.stickyIndicator = changes.stickyIndicator;
  if (typeof changes.locked === 'boolean') next.locked = changes.locked;
  if (changes.comments) next.comments = normalizeComments(changes.comments);

  setState({ notes: state.notes.map(note => (note.id === id ? next : note)) });
  if (persist) save();
  return next;
}

/* Remove a note permanently from this browser. */
export function deleteNote(id: string) {
  if (SAMPLE_NOTES.some(note => note.id === id)) deletedIds = [...deletedIds, id];
  setState({ notes: state.notes.filter(note => note.id !== id) });
  save();
}

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

function subscribe(listener: () => void) {
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

export function useSaveStatus() {
  return useSyncExternalStore(subscribe, () => state.saveStatus);
}

/* Load saved notes once, when this module is first imported. */
state = { notes: load(), saveStatus: 'saved' };
if (!storageAvailable) state.saveStatus = 'unsaved';
