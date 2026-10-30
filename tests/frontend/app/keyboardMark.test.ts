import { expect, it } from 'vitest';
import { startKeyboardMark } from '../../../src/frontend/app/keyboardMark';

it('marks keyboard navigation but not a Tab handled by the editor', () => {
  startKeyboardMark();
  const editor = document.createElement('div');
  document.body.append(editor);

  editor.addEventListener('keydown', event => event.preventDefault(), { once: true });
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  expect(document.documentElement.hasAttribute('data-keyboard')).toBe(false);

  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  expect(document.documentElement.hasAttribute('data-keyboard')).toBe(true);
  editor.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  expect(document.documentElement.hasAttribute('data-keyboard')).toBe(false);
  editor.remove();
});
