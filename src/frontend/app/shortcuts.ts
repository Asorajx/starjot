import { getPreferences, updatePreferences } from './preferences';


/* =========================
   Shortcut List
   ========================= */

/* The keyboard shortcuts people can change in Settings → Keyboard shortcuts. Keys are written */
/* like "Ctrl+Shift+T": the modifiers in the order Ctrl, Alt, Shift, then one key ("Plus" for +). */
/* Ctrl also means Cmd on a Mac, except for the tab switcher, whose Ctrl is held while choosing. */
export type ShortcutId =
  | 'search' | 'newNote' | 'sidebar' | 'switcher'
  | 'newTab' | 'closeTab' | 'reopenTab' | 'nextTab' | 'previousTab'
  | 'find' | 'replace' | 'zoomIn' | 'zoomOut' | 'zoomReset';

export type ShortcutGroup = 'Everywhere' | 'Tabs' | 'In a note';

/* defaults: the first is the one shown; others also work until the shortcut is changed. */
type ShortcutInfo = { id: ShortcutId; action: string; group: ShortcutGroup; defaults: string[] };

export const SHORTCUTS: ShortcutInfo[] = [
  { id: 'search', action: 'Search', group: 'Everywhere', defaults: ['Ctrl+K'] },
  { id: 'newNote', action: 'New note', group: 'Everywhere', defaults: ['Ctrl+N'] },
  { id: 'sidebar', action: 'Dock or undock the sidebar', group: 'Everywhere', defaults: ['Ctrl+\\'] },
  { id: 'switcher', action: 'Switch tabs (hold the first key, tap the last, let go to switch)', group: 'Everywhere', defaults: ['Ctrl+Q'] },
  { id: 'newTab', action: 'New tab', group: 'Tabs', defaults: ['Ctrl+T'] },
  { id: 'closeTab', action: 'Close tab', group: 'Tabs', defaults: ['Ctrl+W'] },
  { id: 'reopenTab', action: 'Reopen the last closed tab', group: 'Tabs', defaults: ['Ctrl+Shift+T'] },
  { id: 'nextTab', action: 'Next tab', group: 'Tabs', defaults: ['Ctrl+Tab'] },
  { id: 'previousTab', action: 'Previous tab', group: 'Tabs', defaults: ['Ctrl+Shift+Tab'] },
  { id: 'find', action: 'Find', group: 'In a note', defaults: ['Ctrl+F'] },
  { id: 'replace', action: 'Find and replace', group: 'In a note', defaults: ['Ctrl+H'] },
  { id: 'zoomIn', action: 'Zoom in', group: 'In a note', defaults: ['Ctrl+=', 'Ctrl+Plus', 'Ctrl+Shift+Plus'] },
  { id: 'zoomOut', action: 'Zoom out', group: 'In a note', defaults: ['Ctrl+-'] },
  { id: 'zoomReset', action: 'Zoom back to 100%', group: 'In a note', defaults: ['Ctrl+0'] }
];

/* Shortcuts that stay as they are, listed beside the others. Their keys are shown as written. */
export const FIXED_SHORTCUTS: { action: string; group: ShortcutGroup; keys: string[] }[] = [
  { action: 'Open a note in a new tab', group: 'Everywhere', keys: ['Ctrl+Click'] },
  { action: 'Close a window or menu, or go back', group: 'Everywhere', keys: ['Esc'] },
  { action: 'Undo and redo', group: 'In a note', keys: ['Ctrl+Z', 'Ctrl+Y'] },
  { action: 'Bold, italic and underline', group: 'In a note', keys: ['Ctrl+B', 'Ctrl+I', 'Ctrl+U'] },
  { action: 'Open or close a toggle', group: 'In a note', keys: ['Ctrl+Enter'] },
  { action: 'Indent or outdent a list item', group: 'In a note', keys: ['Tab', 'Shift+Tab'] }
];

/* Keys that cannot be given to a shortcut, and why: the computer or the browser keeps them, or */
/* they already do something everyone expects. */
const TAKEN: Record<string, string> = {
  'Alt+Tab': 'Windows uses Alt + Tab to switch apps.',
  'Alt+F4': 'Windows uses Alt + F4 to close the window.',
  'Ctrl+Z': 'Ctrl + Z is Undo.',
  'Ctrl+Y': 'Ctrl + Y is Redo.',
  'Ctrl+Shift+Z': 'Ctrl + Shift + Z is Redo.',
  'Ctrl+B': 'Ctrl + B is Bold.',
  'Ctrl+I': 'Ctrl + I is Italic.',
  'Ctrl+U': 'Ctrl + U is Underline.',
  'Ctrl+A': 'Ctrl + A selects everything.',
  'Ctrl+C': 'Ctrl + C is Copy.',
  'Ctrl+X': 'Ctrl + X is Cut.',
  'Ctrl+V': 'Ctrl + V is Paste.',
  'Ctrl+Shift+Q': 'Ctrl + Shift + Q quits Chrome and Edge.'
};

/* Keys a browser tab keeps for itself: they can be chosen, but only reach Starjot in the desktop app. */
const BROWSER_KEYS = new Set(['Ctrl+N', 'Ctrl+T', 'Ctrl+W', 'Ctrl+Shift+T', 'Ctrl+Shift+N', 'Ctrl+Shift+W', 'Ctrl+Tab', 'Ctrl+Shift+Tab']);

/* Keys used for typing and moving around text, which a shortcut must not take. */
const TEXT_KEYS = new Set(['Enter', 'Backspace', 'Delete', 'Escape', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Insert']);

const KEY_NAMES: Record<string, string> = { '\\': '\\', Plus: '+', Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };


/* =========================
   Reading Keys
   ========================= */

/* The keys pressed, written as a shortcut, or null for a modifier on its own (or with AltGr, */
/* which some keyboards use to type characters and which counts as Ctrl + Alt). */
export function comboOf(event: KeyboardEvent) {
  if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock'].includes(event.key)) return null;
  const ctrl = event.ctrlKey || event.metaKey;
  if (ctrl && event.altKey) return null;
  let key = event.key === ' ' ? 'Space' : event.key === '+' ? 'Plus' : event.key;
  if (key.length === 1) key = key.toUpperCase();
  return [ctrl && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', key].filter(Boolean).join('+');
}

/* The keys a shortcut uses now: the ones chosen in Settings, or its defaults. */
export function keysOf(id: ShortcutId): string[] {
  const chosen = getPreferences().shortcuts[id];
  return chosen ? [chosen] : (SHORTCUTS.find(item => item.id === id)?.defaults ?? []);
}

export function isChanged(id: ShortcutId) {
  return Boolean(getPreferences().shortcuts[id]);
}

/* Whether a key press is this shortcut. The tab switcher's Ctrl must be Ctrl itself (Cmd + Q */
/* quits apps on a Mac). */
export function isShortcut(event: KeyboardEvent, id: ShortcutId) {
  const combo = comboOf(event);
  if (!combo || !keysOf(id).includes(combo)) return false;
  return id !== 'switcher' || !combo.startsWith('Ctrl') || (event.ctrlKey && !event.metaKey);
}

/* The modifier held while the tab switcher is open; letting go of it switches. */
export function switcherModifier() {
  return keysOf('switcher')[0].startsWith('Alt') ? 'Alt' : 'Control';
}

/* Keys as people read them: "Ctrl + Shift + T". */
export function keyLabel(combo: string) {
  return keyParts(combo).join(' + ');
}

/* The separate keys of a shortcut, for drawing each as a key cap. */
export function keyParts(combo: string) {
  return combo.split('+').map(part => KEY_NAMES[part] ?? part);
}

/* A shortcut's keys for a tooltip, such as "Ctrl + K". */
export function shortcutLabel(id: ShortcutId) {
  return keyLabel(keysOf(id)[0]);
}


/* =========================
   Changing Keys
   ========================= */

export type ComboCheck =
  | { kind: 'ok'; browserOnly: boolean }
  | { kind: 'refused'; reason: string }
  | { kind: 'taken'; by: ShortcutId };

/* Whether keys can be given to a shortcut: they need Ctrl or Alt (so typing is never caught), */
/* must not be kept by the computer or an everyday shortcut, and may already belong to another */
/* shortcut (which can then swap). */
export function checkCombo(combo: string, id: ShortcutId): ComboCheck {
  const parts = combo.split('+');
  const key = parts[parts.length - 1];
  if (!parts.includes('Ctrl') && !parts.includes('Alt')) return { kind: 'refused', reason: 'Use Ctrl or Alt with the key, so typing is never caught.' };
  if (TEXT_KEYS.has(key)) return { kind: 'refused', reason: `${KEY_NAMES[key] ?? key} is used for typing and moving through text.` };
  if (TAKEN[combo]) return { kind: 'refused', reason: TAKEN[combo] };
  if (id === 'switcher' && parts.length !== 2) return { kind: 'refused', reason: 'The tab switcher needs one key held (Ctrl or Alt) and one key to tap.' };
  const by = SHORTCUTS.find(item => item.id !== id && keysOf(item.id).includes(combo));
  if (by) return { kind: 'taken', by: by.id };
  return { kind: 'ok', browserOnly: BROWSER_KEYS.has(combo) };
}

/* Give a shortcut new keys; its defaults remove the change. */
export function setShortcut(id: ShortcutId, combo: string) {
  const shortcuts = { ...getPreferences().shortcuts };
  if (SHORTCUTS.find(item => item.id === id)?.defaults[0] === combo) delete shortcuts[id];
  else shortcuts[id] = combo;
  updatePreferences({ shortcuts });
}

/* Give two shortcuts each other's keys. */
export function swapShortcuts(id: ShortcutId, other: ShortcutId, combo: string) {
  const previous = keysOf(id)[0];
  setShortcut(id, combo);
  setShortcut(other, previous);
}

export function resetShortcut(id: ShortcutId) {
  const shortcuts = { ...getPreferences().shortcuts };
  delete shortcuts[id];
  updatePreferences({ shortcuts });
}

export function resetAllShortcuts() {
  updatePreferences({ shortcuts: {} });
}
