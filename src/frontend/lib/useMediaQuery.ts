import { useEffect, useState } from 'react';


/* =========================
   Media Queries
   ========================= */

/* Whether a CSS media query matches, such as a minimum window width, updated as the window changes. */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return matches;
}
