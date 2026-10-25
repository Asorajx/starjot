/* Whether a key press is a letter (or other printable character) to jump with, not a shortcut. */
export function isTypeaheadKey(event: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }) {
  return event.key.length === 1 && /\S/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey;
}

/* The next item after `from` (going round to the start) whose label starts with the letter, or */
/* -1 when none does. Typing the same letter again moves on to the next match. */
export function nextByLetter(labels: string[], from: number, letter: string) {
  const wanted = letter.toLowerCase();
  for (let step = 1; step <= labels.length; step += 1) {
    const index = (from + step + labels.length) % labels.length;
    if (labels[index].trim().toLowerCase().startsWith(wanted)) return index;
  }
  return -1;
}
