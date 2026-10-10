/* =========================
   Preferences Storage
   ========================= */

/* App-wide preferences (theme, zoom, sidebar) saved in this browser. */
/* The key keeps the app's earlier name (Strata) so saved preferences still load. */
const STORAGE_KEY = 'strata-preferences-v1';

/* Returns the saved object, or an empty object when nothing usable is saved. */
export function readPreferences(): Record<string, unknown> {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

/* Saving can fail (for example in private browsing); preferences then last for this visit only. */
export function writePreferences(preferences: object) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    /* Nothing else to do: the app keeps working with the preferences in memory. */
  }
}
