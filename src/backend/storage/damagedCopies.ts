/* =========================
   Damaged Copies
   ========================= */

/* Saved data that cannot be read (broken JSON, or not the expected shape) is never written */
/* over. Its raw text is first copied to a key of its own, "<key>-damaged" (or "-damaged-2" and */
/* on when one is kept already), so it can be downloaded from Settings → Storage. When even the */
/* copy cannot be made (storage full), the store that found it stops saving instead. */
const SUFFIX = '-damaged';

/* What was found while loading, for one message when the app opens. */
export type DamagedData = { key: string; label: string; kept: boolean };
const found: DamagedData[] = [];

/* Copy the raw text aside; true when it is safe to save over the original. */
export function keepDamagedCopy(key: string, label: string, raw: string) {
  let kept = false;
  try {
    let copyKey = `${key}${SUFFIX}`;
    for (let number = 2; localStorage.getItem(copyKey) !== null && localStorage.getItem(copyKey) !== raw; number += 1) {
      copyKey = `${key}${SUFFIX}-${number}`;
    }
    localStorage.setItem(copyKey, raw);
    kept = true;
  } catch {
    kept = false;
  }
  found.push({ key, label, kept });
  return kept;
}

/* The damaged data found when the app opened. */
export function damagedOnLoad(): readonly DamagedData[] {
  return found;
}

/* Every kept copy, for Settings → Storage. */
export function damagedCopies() {
  const copies: { key: string; size: number }[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && new RegExp(`${SUFFIX}(-\\d+)?$`).test(key)) copies.push({ key, size: localStorage.getItem(key)?.length ?? 0 });
    }
  } catch {
    return [];
  }
  return copies.sort((a, b) => a.key.localeCompare(b.key));
}

export function readDamagedCopy(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/* Remove a kept copy (asked first in Settings). */
export function removeDamagedCopy(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Nothing to do: the copy stays. */
  }
}
