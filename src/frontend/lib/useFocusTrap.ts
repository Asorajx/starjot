import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/* The windows keeping the keyboard in, in the order they opened: only the last (a question over */
/* a drawer, say) does, until it closes. */
const traps: HTMLElement[] = [];


/* =========================
   Focus Trap
   ========================= */

/* Keeps Tab and Shift + Tab inside a window (a dialog, drawer, Search or Settings) while it is */
/* open, so the keyboard never wanders to the page behind it: from the last control Tab goes to */
/* the first, and if focus was left outside (a click on the backdrop), Tab brings it back in. */
/* Focus starts on the element matching first (null leaves it to the window, which focuses its */
/* own field), and goes back to where it was when the window closes. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, first: string | null = FOCUSABLE) {
  /* Read while the window first draws, before it moves focus into itself. */
  const opener = useRef(document.activeElement as HTMLElement | null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const before = opener.current;
    traps.push(container);
    if (first !== null) (container.querySelector<HTMLElement>(first) ?? container.querySelector<HTMLElement>(FOCUSABLE))?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !container || traps[traps.length - 1] !== container) return;
      const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(item => item.offsetParent !== null || getComputedStyle(item).position === 'fixed');
      if (!items.length) return;
      const start = items[0];
      const end = items[items.length - 1];
      const active = document.activeElement;
      if (!active || !container.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? end : start).focus();
      } else if (event.shiftKey && active === start) {
        event.preventDefault();
        end.focus();
      } else if (!event.shiftKey && active === end) {
        event.preventDefault();
        start.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      traps.splice(traps.indexOf(container), 1);
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, [ref, first]);
}
