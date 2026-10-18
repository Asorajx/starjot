import { useEffect, useState } from 'react';


/* =========================
   The Time Now
   ========================= */

/* The time now, updated every interval (and when the window comes back into view, since timers */
/* slow down in hidden tabs), for clocks and reminders. */
export function useNow(interval = 15000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = window.setInterval(tick, interval);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [interval]);
  return now;
}
