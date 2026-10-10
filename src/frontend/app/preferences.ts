import { useSyncExternalStore } from 'react';
import { readPreferences, writePreferences } from '../../backend/storage/preferencesStorage';

/* App-wide preferences that apply to every note and screen; the backend saves them. */
export type Theme = 'light' | 'dark';

/* How the page moves when a heading is chosen in Contents: a smooth slide, or an instant jump. */
export type ContentsScroll = 'smooth' | 'instant';

export type Preferences = {
  theme: Theme;

  /* Note zoom as a multiplier: 1 is 100%. */
  zoom: number;
  sidebarCollapsed: boolean;
  contentsScroll: ContentsScroll;
};

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
export const ZOOM_STEP = 0.1;

const listeners = new Set<() => void>();


/* =========================
   Loading and Saving
   ========================= */

/* Light mode is the default; once a theme is chosen in Settings it is remembered between visits. */
function load(): Preferences {
  const defaults: Preferences = { theme: 'light', zoom: 1, sidebarCollapsed: false, contentsScroll: 'smooth' };
  const saved = readPreferences();
  return {
    theme: saved.theme === 'dark' || saved.theme === 'light' ? saved.theme : defaults.theme,
    zoom: typeof saved.zoom === 'number' ? clampZoom(saved.zoom) : defaults.zoom,
    sidebarCollapsed: saved.sidebarCollapsed === true,
    contentsScroll: saved.contentsScroll === 'instant' ? 'instant' : 'smooth'
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
