/* =========================
   Dates
   ========================= */

/* A date such as "12 Oct 2026", written the way the computer's language writes dates. */
export function formatDate(iso: string | null) {
  if (!iso) return 'Unknown';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
