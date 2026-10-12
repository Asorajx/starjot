/* =========================
   Quick Note Draft
   ========================= */

/* The text being typed in Starjot Home's quick note, kept until it is saved as a note, so */
/* switching screens or closing the app does not lose it. */
const STORAGE_KEY = 'starjot-quick-note-v1';

export function readQuickNoteDraft(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

/* An empty draft removes the key. Saving can fail (for example in private browsing); the draft */
/* then lasts for this visit only. */
export function writeQuickNoteDraft(text: string) {
  try {
    if (text) localStorage.setItem(STORAGE_KEY, text);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Nothing else to do: the text stays in the box. */
  }
}
