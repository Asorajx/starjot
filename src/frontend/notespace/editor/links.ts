import { safeHref } from '../sanitize';

/* Where a link leads: a web or email address, or another page in Notespace. */
export type LinkTarget = { kind: 'url'; href: string } | { kind: 'page'; id: string };

/* An address typed without "https://", such as google.com or www.example.org/news. */
const BARE_HOST = /^(localhost|[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,})(:\d+)?([/?#]|$)/i;
const EMAIL = /^[^\s@/:]+@[^\s@/:]+\.[a-z]{2,}$/i;


/* =========================
   Reading and Changing Links
   ========================= */

/* Addresses typed without a scheme ("google.com") become https addresses, and email addresses */
/* become mailto links. Returns null for anything that is not a web or email address, so a link */
/* can never run script. */
export function normalizeAddress(value: string) {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  /* "localhost:5173" has a port number, not a scheme, after its colon. */
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(trimmed)) return safeHref(trimmed);
  if (EMAIL.test(trimmed)) return `mailto:${trimmed}`;
  return BARE_HOST.test(trimmed) ? `https://${trimmed}` : null;
}

export function linkTarget(link: HTMLAnchorElement): LinkTarget | null {
  if (link.classList.contains('page-link') && link.dataset.page) return { kind: 'page', id: link.dataset.page };
  const href = safeHref(link.getAttribute('href'));
  return href ? { kind: 'url', href } : null;
}

/* Point a link somewhere else, turning it into a page link or an address link as needed. */
export function setLinkTarget(link: HTMLAnchorElement, target: LinkTarget) {
  if (target.kind === 'page') {
    link.classList.add('page-link');
    link.dataset.page = target.id;
    link.removeAttribute('href');
  } else {
    link.classList.remove('page-link');
    link.removeAttribute('data-page');
    link.setAttribute('href', target.href);
  }
  if (!link.className) link.removeAttribute('class');
}

/* Remove a link but keep its words in the text. */
export function unwrapLink(link: HTMLAnchorElement) {
  const parent = link.parentNode;
  if (!parent) return;
  while (link.firstChild) parent.insertBefore(link.firstChild, link);
  link.remove();
  parent.normalize();
}

export function createLink(text: string, target: LinkTarget) {
  const link = document.createElement('a');
  link.textContent = text;
  setLinkTarget(link, target);
  return link;
}

/* The link that ends exactly at a collapsed caret: the caret is at the end of the link's own text, */
/* or right after the link. */
function linkEndingAt(range: Range) {
  const { startContainer: node, startOffset: offset } = range;
  const element = node instanceof Element ? node : node.parentElement;
  const inside = element?.closest('a');
  if (inside) {
    const rest = document.createRange();
    rest.setStart(node, offset);
    rest.setEnd(inside, inside.childNodes.length);
    return rest.toString() ? null : inside;
  }

  let before: Node | null = node.nodeType === Node.TEXT_NODE
    ? (offset === 0 ? node.previousSibling : null)
    : node.childNodes[offset - 1] ?? null;
  while (before && !(before instanceof HTMLAnchorElement) && before.lastChild) before = before.lastChild;
  const last = before instanceof Element ? before : before?.parentElement;
  return before ? last?.closest('a') ?? null : null;
}

/* Browsers add text typed right after a link to the link, so the link keeps growing. The typed */
/* text is put after the link instead. Returns true when it handled the typing. */
export function typeAfterLink(event: InputEvent) {
  const selection = window.getSelection();
  if (event.inputType !== 'insertText' || !event.data || !selection?.rangeCount || !selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  const link = linkEndingAt(range);
  if (!link?.parentNode) return false;
  event.preventDefault();

  /* Join the text that already follows the link, or start a new text node after it. */
  const next = link.nextSibling;
  const text = next?.nodeType === Node.TEXT_NODE ? next as Text : link.parentNode.insertBefore(document.createTextNode(''), next);

  /* A space at the end of a line is only shown when it is a non-breaking space, as browsers type it. */
  const typed = event.data === ' ' && !text.length ? ' ' : event.data;
  text.insertData(0, typed);
  const caret = document.createRange();
  caret.setStart(text, typed.length);
  selection.removeAllRanges();
  selection.addRange(caret);
  return true;
}

/* The page a copied page link leads to (see copyLink in LinkTools), when the clipboard's HTML is */
/* exactly one page link whose words are the plain text being pasted. */
export function copiedPageLink(html: string, plain: string) {
  if (!html) return null;

  /* A template's contents are inert, so clipboard HTML cannot load images or run event handlers. */
  const holder = document.createElement('template');
  holder.innerHTML = html;
  const links = holder.content.querySelectorAll<HTMLAnchorElement>('a.page-link[data-page]');
  const link = links.length === 1 ? links[0] : null;
  const id = link?.dataset.page ?? '';
  if (!link || link.textContent !== plain || !/^[a-zA-Z0-9_-]{1,90}$/.test(id)) return null;
  return { kind: 'page', id } as const;
}
