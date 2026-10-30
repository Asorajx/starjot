import { useRef, type TouchEvent } from 'react';

/* Close a mobile panel when a downward swipe starts at the top of its scrollable content. */
export function useSwipeDown(onClose: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);

  function onTouchStart(event: TouchEvent<HTMLElement>) {
    start.current = null;
    if (!window.matchMedia('(max-width: 700px)').matches || event.touches.length !== 1) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest('input, textarea, select, [contenteditable="true"], [role="menu"], [role="slider"]')) return;

    /* A swipe inside a scrolled list should scroll it, not close its parent window. */
    let element: Element | null = target;
    while (element && element !== event.currentTarget) {
      const style = window.getComputedStyle(element);
      if (/(auto|scroll)/.test(style.overflowY) && element.scrollTop > 0) return;
      element = element.parentElement;
    }
    start.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }

  function onTouchEnd(event: TouchEvent<HTMLElement>) {
    const origin = start.current;
    start.current = null;
    if (!origin || event.changedTouches.length !== 1) return;
    const dx = event.changedTouches[0].clientX - origin.x;
    const dy = event.changedTouches[0].clientY - origin.y;
    if (dy >= 100 && dy > Math.abs(dx) * 1.5) onClose();
  }

  function onTouchCancel() {
    start.current = null;
  }

  return { onTouchStart, onTouchEnd, onTouchCancel };
}
