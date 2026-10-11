/* =========================
   Safe Document HTML
   ========================= */

/* Only these document tags are kept; anything else is unwrapped and its text kept. */
const ALLOWED_TAGS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE', 'A',
  'BLOCKQUOTE', 'BR', 'SPAN', 'PRE', 'CODE', 'TABLE', 'COLGROUP', 'COL', 'THEAD', 'TBODY', 'TR', 'TH', 'TD'
]);
const DROPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'SVG', 'FORM', 'OBJECT']);
const MAX_CONTENT = 250000;

/* Sticky groups, toggle lists, page blocks, page links, code languages, code token colours */
/* and comment marks are stored as classes. */
function keepsClass(tag: string, name: string) {
  if (name === 'document-tagline' || name === 'overline') return true;
  if (tag === 'DIV' && ['sticky-group', 'toggle-block', 'is-open', 'toggle-body'].includes(name)) return true;
  if (tag === 'SPAN' && name === 'page-block') return true;
  if (/^(P|H[1-5])$/.test(tag) && name === 'toggle-summary') return true;
  if (tag === 'A' && name === 'page-link') return true;
  if (tag === 'TABLE' && name === 'fit-content') return true;
  if (tag === 'CODE' && /^language-[a-z]+$/.test(name)) return true;
  return tag === 'SPAN' && (/^tok-[a-z]+$/.test(name) || name === 'comment-mark');
}

/* Links keep only web and email addresses, so a saved link can never run script. */
export function safeHref(href: string | null) {
  const value = href?.trim() ?? '';
  return /^(https?:|mailto:)/i.test(value) ? value : null;
}

/* Copy the few attributes Notespace uses: link addresses, linked page ids, page block sizes and widths, */
/* table column widths and row heights, how many rows and columns a merged table cell covers, and comment ids. */
function copyAttributes(node: Element, copy: Element) {
  if (node.tagName === 'A') {
    const href = safeHref(node.getAttribute('href'));
    if (href) copy.setAttribute('href', href);
  }
  const page = node.getAttribute('data-page');
  if ((node.tagName === 'A' || node.tagName === 'SPAN') && page && /^[a-zA-Z0-9_-]{1,90}$/.test(page)) copy.setAttribute('data-page', page);
  const size = node.getAttribute('data-size');
  if (node.tagName === 'SPAN' && size && ['small', 'medium', 'large'].includes(size)) copy.setAttribute('data-size', size);
  const width = Number(node.getAttribute('data-width'));
  if (node.tagName === 'SPAN' && Number.isInteger(width) && width >= 25 && width <= 100) copy.setAttribute('data-width', String(width));
  const columnWidth = node.tagName === 'COL' ? Number(node.getAttribute('data-width')) : 0;
  if (Number.isInteger(columnWidth) && columnWidth >= 24 && columnWidth <= 4000) copy.setAttribute('data-width', String(columnWidth));
  const height = node.tagName === 'TR' ? Number(node.getAttribute('data-height')) : 0;
  if (Number.isInteger(height) && height >= 20 && height <= 4000) copy.setAttribute('data-height', String(height));
  ['colspan', 'rowspan'].forEach(name => {
    const span = Number(node.getAttribute(name));
    if ((node.tagName === 'TD' || node.tagName === 'TH') && Number.isInteger(span) && span > 1 && span <= 50) copy.setAttribute(name, String(span));
  });
  const comment = node.getAttribute('data-comment');
  if ((node.tagName === 'SPAN' || node.tagName === 'TABLE') && comment && /^c[a-z0-9]+$/.test(comment)) copy.setAttribute('data-comment', comment);
}

/* Page blocks used to be lines of their own (<div>). They now sit inside text as a <span>, */
/* so an older one becomes a line holding the new kind of block. */
function upgradePageBlock(node: Element) {
  const block = document.createElement('span');
  Array.from(node.attributes).forEach(attribute => block.setAttribute(attribute.name, attribute.value));
  const line = document.createElement('p');
  const cleaned = cleanNode(block);
  if (cleaned) line.appendChild(cleaned);
  return line;
}

function cleanNode(node: Node): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent ?? '');
  if (!(node instanceof Element) || DROPPED_TAGS.has(node.tagName)) return null;
  if (node.tagName === 'DIV' && node.classList.contains('page-block')) return upgradePageBlock(node);

  /* A page block's title and buttons are drawn when it is shown, so only the empty block is stored. */
  const children = document.createDocumentFragment();
  const keepsChildren = !node.classList.contains('page-block');
  if (keepsChildren) {
    node.childNodes.forEach(child => {
      const cleaned = cleanNode(child);
      if (cleaned) children.appendChild(cleaned);
    });
  }
  if (!ALLOWED_TAGS.has(node.tagName)) return children;

  /* Copy the element without any attributes except approved classes and attributes. */
  const copy = document.createElement(node.tagName.toLowerCase());
  const classes = Array.from(node.classList).filter(name => keepsClass(node.tagName, name));
  if (classes.length) copy.className = classes.join(' ');
  copyAttributes(node, copy);
  copy.appendChild(children);
  return copy;
}

/* Keep only safe document tags and classes when saving or displaying HTML. */
export function cleanHtml(input: unknown) {
  const template = document.createElement('template');
  template.innerHTML = String(input ?? '').slice(0, MAX_CONTENT);
  const safe = document.createElement('div');
  template.content.childNodes.forEach(node => {
    const cleaned = cleanNode(node);
    if (cleaned) safe.appendChild(cleaned);
  });

  /* Line breaks between stored lines are only formatting; the editor would show them as blank lines. */
  [safe, ...Array.from(safe.querySelectorAll('div.sticky-group'))].forEach(container => {
    Array.from(container.childNodes).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE && /^\s*$/.test(node.textContent ?? '') && node.textContent?.includes('\n')) node.remove();
    });
  });

  /* A sticky group with nothing left inside it is removed. */
  safe.querySelectorAll('div.sticky-group').forEach(group => {
    if (!group.textContent?.trim() && !group.querySelector('br, hr')) group.remove();
  });
  return safe.innerHTML;
}

/* Plain text version of stored HTML, used for previews. */
/* A space is added after each line and table cell, so words from separate lines do not run together. */
export function htmlToText(html: string) {
  const holder = document.createElement('div');
  holder.innerHTML = html.replace(/<\/(p|h[1-6]|li|td|th|pre|blockquote)>/gi, '$& ');
  return (holder.textContent ?? '').replace(/\s+/g, ' ');
}
