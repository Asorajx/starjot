import { useEffect, useState } from 'react';

/* How long a menu takes to fade out (matches .page-menu.is-closing in tables.css). */
export const MENU_EXIT = 100;

/* Keeps something on the page for a moment after it closes, so it can animate out: `mounted` */
/* while it is open or still closing, and `closing` during that last moment. */
export function usePresence(open: boolean, exit = MENU_EXIT) {
  const [lingering, setLingering] = useState(false);
  useEffect(() => {
    if (open) {
      setLingering(true);
      return;
    }
    const timer = window.setTimeout(() => setLingering(false), exit);
    return () => window.clearTimeout(timer);
  }, [open, exit]);
  return { mounted: open || lingering, closing: !open && lingering };
}
