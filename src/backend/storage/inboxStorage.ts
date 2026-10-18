/* =========================
   Inbox
   ========================= */

/* The inbox's notifications (such as reminders that came due), kept between visits until they */
/* are archived and cleared. The frontend checks each record (app/inbox.ts). */
const STORAGE_KEY = 'starjot-inbox-v1';

export function readInbox(): unknown[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

/* Saving can fail (for example in private browsing); the inbox then lasts for this visit only. */
export function writeInbox(items: unknown[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* Nothing else to do: the inbox stays as it is on screen. */
  }
}
