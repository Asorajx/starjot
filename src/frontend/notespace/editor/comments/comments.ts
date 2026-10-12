/* =========================
   Comment Marks
   ========================= */

/* Commented words are wrapped in <span class="comment-mark" data-comment="id">. */
/* Each comment gets a short unique id that links its marks to its stored text. */
export function newCommentId() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/* Wrap the text inside a range. Returns false when the range holds no note text. */
/* A selection can cross several lines, so each piece of selected text gets its own span. */
export function markRange(range: Range, id: string) {
  const root = range.commonAncestorContainer;
  const walker = document.createTreeWalker(root instanceof Element ? root : root.parentElement ?? document.body, NodeFilter.SHOW_TEXT);
  const pieces: Text[] = [];
  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    if (range.intersectsNode(text) && text.parentElement?.closest('[data-note-editable]') && text.textContent?.trim()) pieces.push(text);
  }
  if (!pieces.length && root.nodeType === Node.TEXT_NODE) pieces.push(root as Text);

  pieces.forEach(original => {
    let text = original;

    /* Split off the parts of the first and last text nodes that sit outside the selection. */
    if (text === range.endContainer && range.endOffset < text.length) text.splitText(range.endOffset);
    if (text === range.startContainer && range.startOffset > 0) text = text.splitText(range.startOffset);
    if (!text.textContent) return;

    const mark = document.createElement('span');
    mark.className = 'comment-mark';
    mark.dataset.comment = id;
    text.replaceWith(mark);
    mark.appendChild(text);
  });
  return pieces.length > 0;
}

/* Remove a comment's marks, keeping the text they wrapped. A comment on a whole table is */
/* stored as an attribute on the table, which is simply removed. */
export function unmark(root: Element, id: string) {
  root.querySelectorAll(`[data-comment="${id}"]`).forEach(mark => {
    if (mark.classList.contains('comment-mark')) mark.replaceWith(...Array.from(mark.childNodes));
    else mark.removeAttribute('data-comment');
  });
}
