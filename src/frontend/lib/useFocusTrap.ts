import { useEffect, type RefObject } from 'react';

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';


/* =========================
   Focus Trap
   ========================= */

/* Keeps Tab and Shift + Tab inside a window (such as Settings) while it is open, so the keyboard */
/* never wanders to the page behind it. Focus starts on the element matching first, and goes */
/* back to where it was when the window closes. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, first?: string) {
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const before = document.activeElement as HTMLElement | null;
    (container.querySelector<HTMLElement>(first ?? FOCUSABLE) ?? container.querySelector<HTMLElement>(FOCUSABLE))?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !container) return;
      const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(item => item.offsetParent !== null);
      if (!items.length) return;
      const start = items[0];
      const end = items[items.length - 1];
      if (event.shiftKey && document.activeElement === start) {
        event.preventDefault();
        end.focus();
      } else if (!event.shiftKey && document.activeElement === end) {
        event.preventDefault();
        start.focus();
      }
    }
    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      before?.focus?.();
    };
  }, [ref, first]);
}
