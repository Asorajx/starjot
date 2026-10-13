import { useSyncExternalStore } from 'react';
import { readPreferences, writePreferences } from '../../backend/storage/preferencesStorage';
import { clampSize, HEX_COLOR, INK } from '../notespace/editor/drawing/drawing';
import { normalizeExportSettings, type ExportSettings } from '../notespace/export/exportSettings';
import { isColorClass, type ColorClass } from '../notespace/editor/format/colors';

/* App-wide preferences that apply to every note and screen; the backend saves them. */
export type Theme = 'light' | 'dark';

/* How the page moves when a heading is chosen in Contents: a smooth slide, or an instant jump. */
export type ContentsScroll = 'smooth' | 'instant';

/* The order of the All notes list. */
export type NotesSort = 'edited' | 'opened' | 'title';

/* What drawing mode draws with: the chosen tool, and the pen's and highlighter's own colour and */
/* size. The eraser removes whole strokes; Select draws a box around strokes to anchor them into the */
/* text. selectEdge decides what happens to strokes on the box's edge: "whole" takes the strokes */
/* that are mostly inside it, "cut" cuts strokes at the edge. With snap on, an anchored drawing lines */
/* up with its line and the side of the text; with it off, it stays exactly where it is put. */
export type DrawingToolName = 'pen' | 'highlighter' | 'eraser' | 'select';
export type PenSettings = { color: string; size: number };
export type DrawingPreferences = {
  tool: DrawingToolName;
  pen: PenSettings;
  highlighter: PenSettings;
  selectEdge: 'whole' | 'cut';
  snap: boolean;

  /* How strokes are anchored: wrapped by the text (it moves aside) or in front of it. */
  anchorWrap: 'wrap' | 'front';
};

export type Preferences = {
  theme: Theme;

  /* Note zoom as a multiplier: 1 is 100%. */
  zoom: number;

  /* True while the sidebar is not docked (it then opens as a popup). The name is from when an */
  /* undocked sidebar was called collapsed; it is kept so the saved choice still loads. */
  sidebarCollapsed: boolean;
  contentsScroll: ContentsScroll;
  notesSort: NotesSort;

  /* Fade the page bar above a note while typing, until the mouse moves. */
  hideHeaderWhileTyping: boolean;
  drawing: DrawingPreferences;

  /* The choices last made in the Export window. */
  exportSettings: ExportSettings;

  /* Text and background colours used most recently, newest first (up to five). */
  recentColors: ColorClass[];
};

export const RECENT_COLORS = 5;

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
export const ZOOM_STEP = 0.1;

const listeners = new Set<() => void>();


/* =========================
   Loading and Saving
   ========================= */

/* A saved pen's colour and size, or the defaults when they are missing or broken. */
function loadPen(saved: unknown, defaults: PenSettings): PenSettings {
  const record = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>;
  const color = String(record.color ?? '');
  return {
    color: color === INK || HEX_COLOR.test(color) ? color : defaults.color,
    size: typeof record.size === 'number' ? clampSize(record.size) : defaults.size
  };
}

function loadDrawing(saved: unknown): DrawingPreferences {
  const record = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>;
  const tool = record.tool === 'highlighter' || record.tool === 'eraser' || record.tool === 'select' ? record.tool : 'pen';
  return {
    tool,
    pen: loadPen(record.pen, { color: INK, size: 3 }),
    highlighter: loadPen(record.highlighter, { color: '#ffd84d', size: 18 }),
    selectEdge: record.selectEdge === 'cut' ? 'cut' : 'whole',
    snap: record.snap !== false,
    anchorWrap: record.anchorWrap === 'front' ? 'front' : 'wrap'
  };
}

/* Light mode is the default; once a theme is chosen in Settings it is remembered between visits. */
function load(): Preferences {
  const defaults: Preferences = {
    theme: 'light', zoom: 1, sidebarCollapsed: false, contentsScroll: 'smooth', notesSort: 'edited', hideHeaderWhileTyping: true, drawing: loadDrawing(null),
    exportSettings: normalizeExportSettings(null),
    recentColors: []
  };
  const saved = readPreferences();
  return {
    theme: saved.theme === 'dark' || saved.theme === 'light' ? saved.theme : defaults.theme,
    zoom: typeof saved.zoom === 'number' ? clampZoom(saved.zoom) : defaults.zoom,
    sidebarCollapsed: saved.sidebarCollapsed === true,
    contentsScroll: saved.contentsScroll === 'instant' ? 'instant' : 'smooth',
    notesSort: saved.notesSort === 'opened' || saved.notesSort === 'title' ? saved.notesSort : defaults.notesSort,
    hideHeaderWhileTyping: saved.hideHeaderWhileTyping !== false,
    drawing: loadDrawing(saved.drawing),
    exportSettings: normalizeExportSettings(saved.exportSettings),
    recentColors: Array.isArray(saved.recentColors) ? saved.recentColors.filter((name): name is ColorClass => isColorClass(String(name))).slice(0, RECENT_COLORS) : []
  };
}

let preferences = load();

function clampZoom(zoom: number) {
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)) * 10) / 10;
}

export function updatePreferences(changes: Partial<Preferences>) {
  preferences = { ...preferences, ...changes };
  if (changes.zoom !== undefined) preferences.zoom = clampZoom(changes.zoom);
  writePreferences(preferences);
  applyTheme();
  listeners.forEach(listener => listener());
}

/* The theme is a data-theme attribute on <html>, which the dark stylesheet looks for. */
export function applyTheme() {
  document.documentElement.dataset.theme = preferences.theme;
}

export function getPreferences() {
  return preferences;
}

export function changeZoom(direction: -1 | 0 | 1) {
  updatePreferences({ zoom: direction === 0 ? 1 : preferences.zoom + direction * ZOOM_STEP });
}


/* =========================
   React Hook
   ========================= */

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function usePreferences() {
  return useSyncExternalStore(subscribe, () => preferences);
}
