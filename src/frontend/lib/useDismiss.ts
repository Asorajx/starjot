import { useEffect, useRef } from 'react';


/* =========================
   Closing Menus and Windows
   ========================= */

/* Call onEscape when Escape is pressed while active. It is caught early (capture) and stopped, */
/* so it only closes this menu or window, and the note editor does not also go back. */
export function useEscape(active: boolean, onEscape: () => void) {
  const latest = useRef(onEscape);
  latest.current = onEscape;
  useEffect(() => {
    if (!active) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      latest.current();
    }
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [active]);
}

/* Close something open (a menu, panel or picker) with Escape, or a click anywhere outside the */
/* elements matching inside. */
export function useDismiss(open: boolean, inside: string, onDismiss: () => void) {
  const latest = useRef(onDismiss);
  latest.current = onDismiss;
  useEscape(open, onDismiss);
  useEffect(() => {
    if (!open) return;
    function handleMouseDown(event: MouseEvent) {
      if (!(event.target as Element).closest?.(inside)) latest.current();
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open, inside]);
}
