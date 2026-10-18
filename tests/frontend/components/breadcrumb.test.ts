import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Breadcrumb, type Crumb } from '../../../src/frontend/components/Breadcrumb';

/* React renders straight into the test page; the window width check is answered by phone. */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let phone = false;
window.matchMedia = () => ({ matches: phone, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup());
  phone = false;
});

function render(items: Crumb[]) {
  const holder = document.createElement('div');
  document.body.append(holder);
  const root = createRoot(holder);
  act(() => root.render(createElement(Breadcrumb, { items })));
  cleanups.push(() => {
    act(() => root.unmount());
    holder.remove();
  });
  return holder;
}

const steps = (holder: Element) => Array.from(holder.querySelectorAll('.editor-crumb-step')).map(step => step.textContent);
const trail = (count: number) => Array.from({ length: count }, (_, index) => ({ key: `k${index}`, label: `Step ${index + 1}`, open: vi.fn() }));


/* =========================
   Breadcrumb
   ========================= */

describe('breadcrumb', () => {
  it('shows up to three steps, the last as the current page', () => {
    const holder = render(trail(3));
    expect(steps(holder)).toEqual(['Step 1', 'Step 2', 'Step 3']);
    expect(holder.querySelector('[aria-current="page"]')?.textContent).toBe('Step 3');
  });

  it('folds earlier steps into "…" past three, or past two on a phone', () => {
    expect(steps(render(trail(5)))).toEqual(['…', 'Step 3', 'Step 4', 'Step 5']);
    phone = true;
    expect(steps(render(trail(3)))).toEqual(['…', 'Step 2', 'Step 3']);
  });

  it('opens a step when clicked, in a new tab with Ctrl', () => {
    const items = trail(2);
    const holder = render(items);
    const link = holder.querySelector<HTMLButtonElement>('.editor-crumb-parent');
    act(() => link?.click());
    act(() => link?.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })));
    expect(items[0].open.mock.calls).toEqual([[false], [true]]);
  });
});
