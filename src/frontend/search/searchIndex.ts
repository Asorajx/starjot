/* =========================
   Search Entries
   ========================= */

/* Something search can find: a note, a category or a Boardspace item. Everything searched is */
/* already on this device; nothing is sent anywhere. */
export type SearchEntry = {
  kind: 'note' | 'category' | 'task';
  id: string;
  title: string;

  /* The note's emoji icon, if it has one. */
  icon?: string;

  /* Where it lives, shown after the title, such as "Work / Project Atlas". */
  path: string[];

  /* Everything else that can match: a note's description, text, remarks and comments; a task's */
  /* ID, tags and description. */
  text: string;

  /* For "Title only" and the In filter: a note's category id, or "boardspace". */
  scope: string;

  /* Newest first among equally good matches. */
  updatedAt: string;
};

/* A short piece of the text around a match, for the result line. */
export type Snippet = { before: string; match: string; after: string };

export type SearchResult = {
  entry: SearchEntry;
  snippet: Snippet | null;

  /* The words to look for with the find bar after opening a note matched in its text. */
  findTerm: string;
};

export type SearchOptions = {
  titleOnly: boolean;

  /* 'all', 'notes' (every note), a category id, or 'boardspace'. */
  scope: string;
};

const SNIPPET_BEFORE = 32;
const SNIPPET_LENGTH = 140;


/* =========================
   Matching
   ========================= */

/* Lower case without accents, so "Cafe" finds "café". Each character of the result remembers */
/* which character of the original it came from, so a match can be shown in the original text. */
function fold(text: string) {
  let folded = '';
  const from: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const plain = text[index].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    folded += plain;
    for (let step = 0; step < plain.length; step += 1) from.push(index);
  }
  return { folded, from };
}

/* Entries are made again whenever notes change, so their folded text is worked out once per */
/* entry and kept until then, instead of on every key press. */
const foldedEntries = new WeakMap<SearchEntry, { title: string; text: string }>();

function foldedOf(entry: SearchEntry) {
  let folded = foldedEntries.get(entry);
  if (!folded) {
    folded = { title: fold(entry.title).folded, text: fold(entry.text).folded };
    foldedEntries.set(entry, folded);
  }
  return folded;
}

export function normalizeQuery(query: string) {
  return fold(query).folded.split(/\s+/).filter(Boolean);
}

/* The text around the first place one of the words appears, or null when none do. */
function snippetFor(text: string, words: string[]): Snippet | null {
  const { folded, from } = fold(text);
  let at = -1;
  let length = 0;
  for (const word of words) {
    const found = folded.indexOf(word);
    if (found !== -1 && (at === -1 || found < at)) {
      at = found;
      length = word.length;
    }
  }
  if (at === -1) return null;
  const start = from[at];
  const end = from[at + length - 1] + 1;
  const cut = Math.max(0, start - SNIPPET_BEFORE);
  const before = (cut > 0 ? '…' : '') + text.slice(cut, start).replace(/\s+/g, ' ').trimStart();
  const after = text.slice(end, cut + SNIPPET_LENGTH).replace(/\s+/g, ' ') + (cut + SNIPPET_LENGTH < text.length ? '…' : '');
  return { before, match: text.slice(start, end), after };
}

/* How good a title match is: the whole title, its start, every word in it, or not all words. */
function titleRank(folded: string, query: string, words: string[]) {
  if (folded === query) return 0;
  if (folded.startsWith(query)) return 1;
  if (words.every(word => folded.includes(word))) return 2;
  return 3;
}

/* Whether an entry is in what the "In" filter chose. */
export function inScope(entry: SearchEntry, scope: string) {
  if (scope === 'all') return true;
  if (scope === 'notes') return entry.kind !== 'task';
  if (scope === 'boardspace') return entry.kind === 'task';
  return entry.kind === 'note' && entry.scope === scope;
}

/* Every entry containing all the words (in its title, or anywhere unless Title only is on), */
/* best first: title matches before text matches, then the most recently changed. */
export function search(entries: SearchEntry[], query: string, options: SearchOptions): SearchResult[] {
  const words = normalizeQuery(query);
  if (!words.length) return [];
  const whole = words.join(' ');
  const results: (SearchResult & { rank: number })[] = [];

  for (const entry of entries) {
    if (!inScope(entry, options.scope)) continue;
    const folded = foldedOf(entry);
    const inTitle = (word: string) => folded.title.includes(word);
    const inText = (word: string) => folded.text.includes(word);
    if (!words.every(word => inTitle(word) || (!options.titleOnly && inText(word)))) continue;

    const rank = titleRank(folded.title, whole, words);
    const textMatch = rank === 3;
    const snippet = textMatch ? snippetFor(entry.text, words) : null;
    const findTerm = textMatch ? (inText(whole) ? query.trim() : words.find(inText) ?? '') : '';
    results.push({ entry, snippet, findTerm, rank });
  }

  return results
    .sort((a, b) => a.rank - b.rank || b.entry.updatedAt.localeCompare(a.entry.updatedAt))
    .map(({ entry, snippet, findTerm }) => ({ entry, snippet, findTerm }));
}


/* =========================
   Recent Notes
   ========================= */

export type DayGroup = 'Today' | 'Yesterday' | 'Earlier';

/* Which day group an opened time falls in, counted in calendar days from now. */
export function dayGroup(openedAt: string, now = new Date()): DayGroup {
  const opened = new Date(openedAt);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (opened.getTime() >= startOfToday) return 'Today';
  if (opened.getTime() >= startOfToday - 24 * 60 * 60 * 1000) return 'Yesterday';
  return 'Earlier';
}
