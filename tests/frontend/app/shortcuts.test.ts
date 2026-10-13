import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkCombo, comboOf, isShortcut, keyLabel, keysOf, resetAllShortcuts, resetShortcut, setShortcut, shortcutLabel, swapShortcuts, switcherModifier
} from '../../../src/frontend/app/shortcuts';

function press(key: string, modifiers: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {}) {
  return new KeyboardEvent('keydown', { key, ...modifiers });
}

beforeEach(() => resetAllShortcuts());


/* =========================
   Keyboard Shortcuts
   ========================= */

describe('keyboard shortcuts', () => {
  it('writes key presses as shortcuts, ignoring a modifier on its own and AltGr', () => {
    expect(comboOf(press('k', { ctrlKey: true }))).toBe('Ctrl+K');
    expect(comboOf(press('T', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+T');
    expect(comboOf(press('+', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+Plus');
    expect(comboOf(press('Control', { ctrlKey: true }))).toBeNull();
    expect(comboOf(press('@', { ctrlKey: true, altKey: true }))).toBeNull();
    expect(keyLabel('Ctrl+Shift+Plus')).toBe('Ctrl + Shift + +');
  });

  it('matches the default keys, including Cmd for Ctrl, but not Cmd for the tab switcher', () => {
    expect(isShortcut(press('k', { metaKey: true }), 'search')).toBe(true);
    expect(isShortcut(press('+', { ctrlKey: true, shiftKey: true }), 'zoomIn')).toBe(true);
    expect(isShortcut(press('q', { ctrlKey: true }), 'switcher')).toBe(true);
    expect(isShortcut(press('q', { metaKey: true }), 'switcher')).toBe(false);
    expect(isShortcut(press('k'), 'search')).toBe(false);
  });

  it('uses new keys once changed, and the defaults again after a reset', () => {
    setShortcut('search', 'Alt+S');
    expect(isShortcut(press('s', { altKey: true }), 'search')).toBe(true);
    expect(isShortcut(press('k', { ctrlKey: true }), 'search')).toBe(false);
    expect(shortcutLabel('search')).toBe('Alt + S');
    resetShortcut('search');
    expect(keysOf('search')).toEqual(['Ctrl+K']);
  });

  it('refuses keys used for typing or kept by the computer, and finds keys another shortcut has', () => {
    expect(checkCombo('K', 'search')).toMatchObject({ kind: 'refused' });
    expect(checkCombo('Ctrl+B', 'search')).toMatchObject({ kind: 'refused' });
    expect(checkCombo('Alt+Tab', 'search')).toMatchObject({ kind: 'refused' });
    expect(checkCombo('Ctrl+Enter', 'search')).toMatchObject({ kind: 'refused' });
    expect(checkCombo('Ctrl+Shift+Q', 'switcher')).toMatchObject({ kind: 'refused' });
    expect(checkCombo('Ctrl+F', 'search')).toEqual({ kind: 'taken', by: 'find' });
    expect(checkCombo('Ctrl+W', 'search')).toEqual({ kind: 'taken', by: 'closeTab' });
    expect(checkCombo('Ctrl+J', 'search')).toEqual({ kind: 'ok', browserOnly: false });
  });

  it('notes keys a browser keeps, and swaps keys between two shortcuts', () => {
    resetShortcut('newTab');
    setShortcut('newTab', 'Ctrl+J');
    expect(checkCombo('Ctrl+T', 'search')).toEqual({ kind: 'ok', browserOnly: true });
    swapShortcuts('search', 'find', 'Ctrl+F');
    expect(keysOf('search')).toEqual(['Ctrl+F']);
    expect(keysOf('find')).toEqual(['Ctrl+K']);
  });

  it('lets go of the tab switcher on the key it holds', () => {
    expect(switcherModifier()).toBe('Control');
    setShortcut('switcher', 'Alt+Q');
    expect(switcherModifier()).toBe('Alt');
  });
});
