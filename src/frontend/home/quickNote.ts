import { escapeHtml } from '../lib/html';


/* =========================
   Quick Note
   ========================= */

/* Note titles are cut to this length by the store. */
const TITLE_LENGTH = 160;

/* Splits quick note text into a note: the first line with text becomes the title, and the lines */
/* after it become paragraphs (an empty line stays as an empty paragraph). Text is escaped, so */
/* nothing typed is ever read as HTML. */
export function quickNoteParts(text: string) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const first = lines.findIndex(line => line.trim());
  if (first === -1) return null;
  const title = lines[first].trim().slice(0, TITLE_LENGTH);
  const rest = lines.slice(first + 1);
  while (rest.length && !rest[0].trim()) rest.shift();
  while (rest.length && !rest[rest.length - 1].trim()) rest.pop();
  const content = rest.map(line => (line.trim() ? `<p>${escapeHtml(line)}</p>` : '<p><br></p>')).join('');
  return { title, content };
}
