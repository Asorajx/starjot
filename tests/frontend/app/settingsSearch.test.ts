import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Settings } from '../../../src/frontend/settings/Settings';

let root: Root;
let host: HTMLDivElement;
const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: () => {} });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(createElement(Settings, { section: 'general', onSectionChange: vi.fn(), onClose: vi.fn() })));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
});

function search(value: string) {
  const input = host.querySelector<HTMLInputElement>('[aria-label="Search settings"]')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('settings search', () => {
  it('shows the matching setting with its section and hides unrelated rows', () => {
    search('spellcheck');
    const section = host.querySelector<HTMLElement>('[data-search-section="Notes"]')!;
    const rows = [...section.querySelectorAll<HTMLElement>('.setting-row')];
    expect(section.hidden).toBe(false);
    expect(rows.filter(row => !row.hidden).map(row => row.querySelector('strong')?.textContent)).toEqual(['Spellcheck']);
    expect(host.querySelector('[aria-current="true"]')).toBeNull();
  });

  it('shows a message for no matches and restores the selected section when cleared', () => {
    search('no matching setting');
    expect(host.querySelector('[role="status"]')?.textContent).toContain('No settings found');
    search('');
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(host.querySelector('[aria-current="true"]')?.textContent).toContain('General');
    expect(host.querySelector('[aria-label="Show helpful tips"]')).not.toBeNull();
  });
});
