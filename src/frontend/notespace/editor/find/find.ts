/* Finding words in a note, and replacing them. Matches are kept as Ranges over the note's text, */
/* and shown with the browser's highlights (CSS.highlights), so finding never changes the note. */

/* Parts of a note that are not its own words: buttons, block handles, and the titles drawn into */
/* sub-note cards, mentions and images. */
const SKIPPED = '.block-controls, button, .page-block, .page-mention, .image-block, [contenteditable="false"]';

/* Lines of text. A match never runs from one line into the next. */
const LINES = 'p, h1, h2, h3, h4, h5, h6, li, td, th, pre, .toggle-summary, .block-content';


/* =========================
   Finding
   ========================= */

/* Every place a query appears in root's text, in reading order. Words are matched across */
/* formatting (part bold, part not). within limits the matches to a part of the note. */
export function findMatches(root: Element, query: string, matchCase: boolean, within: Range | null = null) {
  if (!query) return [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: node => (node.parentElement?.closest(SKIPPED) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
  });

  /* All the text in one string, a line break between lines, remembering where each text node starts. */
  const pieces: { node: Text; start: number }[] = [];
  let text = '';
  let lastLine: Element | null = null;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const line = node.parentElement?.closest(LINES) ?? null;
    if (text && line !== lastLine) text += '\n';
    lastLine = line;
    pieces.push({ node, start: text.length });
    text += node.data;
  }

  /* The text node and offset at a position in the joined text. An end position belongs to the */
  /* node the last matched letter is in. */
  const pointAt = (position: number, isEnd: boolean) => {
    let low = 0;
    let high = pieces.length - 1;
    const target = isEnd ? position - 1 : position;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (pieces[middle].start <= target) low = middle;
      else high = middle - 1;
    }
    const piece = pieces[low];
    return { node: piece.node, offset: position - piece.start };
  };

  const haystack = matchCase ? text : text.toLowerCase();
  const needle = matchCase ? query : query.toLowerCase();
  const matches: Range[] = [];
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + needle.length)) {
    if (haystack.slice(at, at + needle.length).includes('\n')) continue;
    const start = pointAt(at, false);
    const end = pointAt(at + needle.length, true);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    if (within && (range.compareBoundaryPoints(Range.START_TO_START, within) < 0 || range.compareBoundaryPoints(Range.END_TO_END, within) > 0)) continue;
    matches.push(range);
  }
  return matches;
}


/* =========================
   Replacing
   ========================= */

/* Put new words in place of a match. They take the formatting of the match's first letter. */
export function replaceMatch(range: Range, words: string) {
  range.deleteContents();
  if (words) range.insertNode(document.createTextNode(words));
}

/* Replace every match, last first so the earlier ones stay where they are. */
export function replaceAll(matches: Range[], words: string) {
  [...matches].reverse().forEach(range => replaceMatch(range, words));
}


/* =========================
   Showing Matches
   ========================= */

/* Highlights are left out where the browser has none (they are a newer feature). */
const canHighlight = () => typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';

/* Show the matches, the current one in a stronger colour, and the part of the note searched. */
export function showMatches(matches: Range[], current: number, within: Range | null) {
  if (!canHighlight()) return;
  CSS.highlights.set('find-match', new Highlight(...matches.filter((_, index) => index !== current)));
  if (matches[current]) CSS.highlights.set('find-current', new Highlight(matches[current]));
  else CSS.highlights.delete('find-current');
  if (within) CSS.highlights.set('find-scope', new Highlight(within));
  else CSS.highlights.delete('find-scope');
}

export function clearMatches() {
  if (!canHighlight()) return;
  ['find-match', 'find-current', 'find-scope'].forEach(name => CSS.highlights.delete(name));
}
