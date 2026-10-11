import { safeHref } from '../sanitize';
import { getNote } from '../store';

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


/* =========================
   Page Addresses
   ========================= */

/* A page's own address, such as https://…/#note=note_abc. Copying a page's link copies this; */
/* pasting it into a note makes a page link, and opening it in the browser opens the page. */
export function pageAddress(id: string) {
  return `${window.location.origin}${window.location.pathname}#note=${id}`;
}

/* Copy a link to a page: its address as plain text (opens the page in a browser, and pasted into */
/* a note makes a page link), and the page link itself for apps that take formatted text. */
export async function copyPageLink(id: string, words = getNote(id)?.title || 'Untitled note') {
  const address = pageAddress(id);
  if (typeof ClipboardItem === 'undefined') {
    await navigator.clipboard.writeText(address);
    return;
  }
  const html = `<a class="page-link" data-page="${id}" href="${address}">${words.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</a>`;
  await navigator.clipboard.write([new ClipboardItem({
    'text/plain': new Blob([address], { type: 'text/plain' }),
    'text/html': new Blob([html], { type: 'text/html' })
  })]);
}

/* The page id in a page address, or null for any other text. Any site's address counts, so a */
/* link copied from another copy of Starjot still finds the page when this browser has it. */
export function pageIdFromAddress(text: string) {
  const match = text.trim().match(/^https?:\/\/\S*#note=([a-zA-Z0-9_-]{1,90})$/);
  return match ? match[1] : null;
}


/* =========================
   Addresses in Text
   ========================= */

/* A web address written in text, starting with http://, https:// or www. */
export const TEXT_ADDRESS = /(?:https?:\/\/|www\.)[^\s<>"'`]+/g;

/* Text after an address that most likely ends the sentence, not the address: a full stop, comma */
/* and so on, or a closing bracket the address did not open. Returns the address and that text. */
export function trimAddress(text: string) {
  let address = text;
  while (address) {
    const last = address.at(-1) as string;
    const unopened = last === ')' && (address.match(/\(/g)?.length ?? 0) < (address.match(/\)/g)?.length ?? 0);
    if (!'.,;:!?\'"'.includes(last) && !unopened) break;
    address = address.slice(0, -1);
  }
  return { address, rest: text.slice(address.length) };
}

/* Common endings of web addresses typed without https:// or www., such as youtube.com. Words */
/* with other endings (file.txt, Node.js) are left as text. */
const COMMON_ENDINGS = 'com|org|net|io|dev|app|ai|co|edu|gov|me|info|biz|tv|xyz|tech|site|blog|news|uk|au|us|ca|de|fr|nz|sg|my|in|jp';

/* A word that is a web address: starting with http://, https:// or www., or a name with a common ending. */
const TYPED_ADDRESS = new RegExp(`^(?:https?:\\/\\/\\S+|www\\.\\S+|[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:${COMMON_ENDINGS})(?:[/?#]\\S*)?)$`, 'i');

/* When Space or Enter follows a typed web address, the address becomes a link (punctuation */
/* typed right after it, such as a full stop, stays text). The key itself is then handled as */
/* usual. Returns true when a link was made. */
export function linkTypedAddress(root: Element) {
  const selection = window.getSelection();
  if (!selection?.isCollapsed || !selection.rangeCount) return false;
  const { startContainer: node, startOffset: offset } = selection.getRangeAt(0);
  const parent = node.parentElement;
  if (node.nodeType !== Node.TEXT_NODE || !root.contains(node) || !parent || parent.closest('a, code, pre')) return false;

  const word = (node.textContent ?? '').slice(0, offset).match(/\S+$/)?.[0];
  const { address, rest } = trimAddress(word ?? '');
  const href = TYPED_ADDRESS.test(address) ? normalizeAddress(address) : null;
  if (!word || !href) return false;

  const start = offset - word.length;
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, start + address.length);
  const link = document.createElement('a');
  link.setAttribute('href', href);
  range.surroundContents(link);

  /* The caret goes back to where it was: after the address and any punctuation typed after it. */
  const caret = document.createRange();
  const after = link.nextSibling;
  if (rest && after?.nodeType === Node.TEXT_NODE) caret.setStart(after, rest.length);
  else caret.setStartAfter(link);
  selection.removeAllRanges();
  selection.addRange(caret);
  return true;
}

/* Plain text split into words and web addresses, for showing comments with clickable links. */
export function textWithAddresses(text: string) {
  const parts: ({ text: string } | { href: string; text: string })[] = [];
  let last = 0;
  for (const match of text.matchAll(TEXT_ADDRESS)) {
    const index = match.index ?? 0;
    const { address, rest } = trimAddress(match[0]);
    const href = normalizeAddress(address);
    if (index > last) parts.push({ text: text.slice(last, index) });
    if (href) parts.push({ href, text: address });
    else parts.push({ text: address });
    if (rest) parts.push({ text: rest });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}


/* =========================
   Typing After Links
   ========================= */

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
