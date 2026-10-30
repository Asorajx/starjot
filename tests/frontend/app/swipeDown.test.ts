import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSwipeDown } from '../../../src/frontend/lib/useSwipeDown';

function gesture(target: Element, from: [number, number], to: [number, number]) {
  const start = new Event('touchstart', { bubbles: true });
  Object.defineProperty(start, 'touches', { value: [{ clientX: from[0], clientY: from[1] }] });
  const end = new Event('touchend', { bubbles: true });
  Object.defineProperty(end, 'changedTouches', { value: [{ clientX: to[0], clientY: to[1] }] });
  act(() => { target.dispatchEvent(start); target.dispatchEvent(end); });
}

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('mobile panel swipe', () => {
  it('closes on a downward swipe but keeps ordinary scrolls, sideways swipes and inputs', () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const close = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    function Panel() {
      const swipe = useSwipeDown(close);
      return createElement('div', swipe,
        createElement('div', { style: { overflowY: 'auto' }, 'data-list': '' }, createElement('span', null, 'Result')),
        createElement('input')
      );
    }
    act(() => root.render(createElement(Panel)));
    const list = host.querySelector('[data-list]') as HTMLElement;
    const result = list.firstElementChild as Element;
    gesture(result, [20, 20], [25, 140]);
    expect(close).toHaveBeenCalledTimes(1);
    list.scrollTop = 20;
    gesture(result, [20, 20], [20, 150]);
    list.scrollTop = 0;
    gesture(result, [20, 20], [160, 130]);
    gesture(host.querySelector('input')!, [20, 20], [20, 150]);
    expect(close).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });
});
