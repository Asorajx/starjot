/* =========================
   Safe Document HTML
   ========================= */

/* Only these document tags are kept; anything else is unwrapped and its text kept. */
const ALLOWED_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE', 'A', 'BLOCKQUOTE', 'BR', 'SPAN', 'PRE', 'CODE']);
const DROPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'SVG', 'FORM', 'OBJECT']);
const MAX_CONTENT = 250000;

/* Sticky groups, code languages, code token colours and comment marks are stored as classes. */
function keepsClass(tag: string, name: string) {
  if (name === 'document-tagline' || name === 'overline') return true;
  if (tag === 'DIV' && name === 'sticky-group') return true;
  if (tag === 'CODE' && /^language-[a-z]+$/.test(name)) return true;
  return tag === 'SPAN' && (/^tok-[a-z]+$/.test(name) || name === 'comment-mark');
}

/* Links keep only web and email addresses, so a saved link can never run script. */
export function safeHref(href: string | null) {
  const value = href?.trim() ?? '';
  return /^(https?:|mailto:)/i.test(value) ? value : null;
}

/* Copy the few attributes Notespace uses: link addresses and comment ids. */
function copyAttributes(node: Element, copy: Element) {
  if (node.tagName === 'A') {
    const href = safeHref(node.getAttribute('href'));
    if (href) copy.setAttribute('href', href);
  }
  const comment = node.getAttribute('data-comment');
  if (node.tagName === 'SPAN' && comment && /^c[a-z0-9]+$/.test(comment)) copy.setAttribute('data-comment', comment);
}

function cleanNode(node: Node): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent ?? '');
  if (!(node instanceof Element) || DROPPED_TAGS.has(node.tagName)) return null;

  const children = document.createDocumentFragment();
  node.childNodes.forEach(child => {
    const cleaned = cleanNode(child);
    if (cleaned) children.appendChild(cleaned);
  });
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
export function htmlToText(html: string) {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  return holder.textContent ?? '';
}
