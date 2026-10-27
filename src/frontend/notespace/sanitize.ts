import { isColorClass } from './editor/format/colors';
import { safeImageAttributes } from './editor/images/images';
import { TAB_TITLE_LENGTH } from './editor/text/tabs';
import { BOX_ID, boxCoordinate, boxWidth } from './canvas/boxes';
import { dropRepeatedLinkIds, LINK_ID } from './editor/links/blockLinks';


/* =========================
   Safe Document HTML
   ========================= */

/* Only these document tags are kept; anything else is unwrapped and its text kept. */
const ALLOWED_TAGS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE', 'A',
  'BLOCKQUOTE', 'BR', 'SPAN', 'PRE', 'CODE', 'TABLE', 'COLGROUP', 'COL', 'THEAD', 'TBODY', 'TR', 'TH', 'TD'
]);
const DROPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'SVG', 'FORM', 'OBJECT']);

/* Sticky groups, toggle lists, tab blocks and the tab shown, checklists and their ticked items, */
/* reminders, a canvas's text boxes, page blocks, page links, code languages, code token colours, comment marks and */
/* text colours are stored as classes. */
function keepsClass(tag: string, name: string) {
  if (name === 'document-tagline' || name === 'overline') return true;
  if (tag === 'DIV' && ['sticky-group', 'toggle-block', 'is-open', 'toggle-body', 'tab-block', 'tab-panel', 'is-active', 'canvas-box'].includes(name)) return true;
  if (tag === 'SPAN' && ['page-block', 'page-mention', 'image-block', 'drawing-block', 'reminder-chip'].includes(name)) return true;
  if (/^(P|H[1-5])$/.test(tag) && name === 'toggle-summary') return true;
  if (tag === 'A' && name === 'page-link') return true;
  if (tag === 'TABLE' && name === 'fit-content') return true;
  if ((tag === 'UL' && name === 'checklist') || (tag === 'LI' && name === 'is-checked')) return true;
  if (tag === 'CODE' && /^language-[a-z]+$/.test(name)) return true;
  return tag === 'SPAN' && (/^tok-[a-z]+$/.test(name) || name === 'comment-mark' || isColorClass(name));
}

/* Links keep only web and email addresses, so a saved link can never run script. */
export function safeHref(href: string | null) {
  const value = href?.trim() ?? '';
  return /^(https?:|mailto:)/i.test(value) ? value : null;
}

/* Copy the few attributes Notespace uses: link addresses, linked page ids, page block sizes and widths, */
/* table column widths and row heights, how many rows and columns a merged table cell covers, comment */
/* ids, and tab names. */
function copyAttributes(node: Element, copy: Element) {
  /* An image keeps only its id, its width in pixels and where it sits on its line; a pinned */
  /* drawing keeps its strokes, its own size and how far it is moved instead of an id. */
  if (node.tagName === 'SPAN' && node.classList.contains('image-block')) {
    Object.entries(safeImageAttributes(node)).forEach(([name, value]) => {
      if (value) copy.setAttribute(`data-${name}`, value);
    });
    const comment = node.getAttribute('data-comment');
    if (comment && /^c[a-z0-9]+$/.test(comment)) copy.setAttribute('data-comment', comment);
    return;
  }
  if (node.tagName === 'A') {
    const href = safeHref(node.getAttribute('href'));
    if (href) copy.setAttribute('href', href);
  }
  /* A block's link id (see blockLinks.ts), on the block and on page links leading to it. */
  const linkId = node.getAttribute('data-link-id') ?? '';
  if (LINK_ID.test(linkId) && /^(P|H[1-5]|LI|BLOCKQUOTE|PRE|TABLE|A)$/.test(node.tagName)) copy.setAttribute('data-link-id', linkId);
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
  /* A reminder keeps its id and its time (when it is a real date). */
  if (node.tagName === 'SPAN' && node.classList.contains('reminder-chip')) {
    const id = node.getAttribute('data-reminder') ?? '';
    const at = Date.parse(node.getAttribute('data-at') ?? '');
    if (/^r[a-z0-9]{1,30}$/.test(id)) copy.setAttribute('data-reminder', id);
    if (!Number.isNaN(at)) copy.setAttribute('data-at', new Date(at).toISOString());
  }
  /* A canvas's text box keeps its id, its place and its width. */
  if (node.tagName === 'DIV' && node.classList.contains('canvas-box')) {
    const box = node.getAttribute('data-box') ?? '';
    if (BOX_ID.test(box)) copy.setAttribute('data-box', box);
    copy.setAttribute('data-x', String(boxCoordinate(node.getAttribute('data-x'))));
    copy.setAttribute('data-y', String(boxCoordinate(node.getAttribute('data-y'))));
    copy.setAttribute('data-width', String(boxWidth(node.getAttribute('data-width'))));
  }
  const title = node.tagName === 'DIV' && node.classList.contains('tab-panel') ? node.getAttribute('data-title')?.trim().slice(0, TAB_TITLE_LENGTH) : '';
  if (title) copy.setAttribute('data-title', title);
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

  /* A tab block's strip of tab names is drawn when shown, so it is never stored. */
  if (node.classList.contains('tab-strip')) return null;
  if (node.tagName === 'DIV' && node.classList.contains('page-block')) return upgradePageBlock(node);

  /* A page block's title and buttons, an image's picture and a reminder's time are drawn when shown, so only the empty block is stored. */
  const children = document.createDocumentFragment();
  const keepsChildren = !['page-block', 'page-mention', 'image-block', 'reminder-chip'].some(name => node.classList.contains(name));
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

/* Keep only safe document tags and classes when saving or displaying HTML. Nothing is cut off, */
/* however long the note: a note too big for storage fails to save visibly (the note bar warns */
/* and the text stays in the editor) rather than losing its end. */
export function cleanHtml(input: unknown) {
  const template = document.createElement('template');
  template.innerHTML = String(input ?? '');
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

  /* A link id is on one block only (a split or copied block loses a repeated one). */
  dropRepeatedLinkIds(safe);

  /* A toggle always has a title and a body, so it can be opened, closed and filled. Older edits */
  /* could delete its body. */
  safe.querySelectorAll('div.toggle-block').forEach(toggle => {
    if (!toggle.querySelector(':scope > .toggle-summary')) {
      const title = document.createElement('p');
      title.className = 'toggle-summary';
      title.appendChild(document.createElement('br'));
      toggle.prepend(title);
    }
    if (!toggle.querySelector(':scope > .toggle-body')) {
      const body = document.createElement('div');
      body.className = 'toggle-body';
      toggle.appendChild(body);
    }
  });

  /* A tab block holds only tabs, each with at least one line, and shows exactly one of them. */
  /* Anything else inside it (left by an edit) goes into the tab shown; a block with no tabs left */
  /* is removed. */
  Array.from(safe.querySelectorAll('div.tab-block')).forEach(block => {
    const panels = Array.from(block.children).filter(child => child.matches('div.tab-panel'));
    if (!panels.length) {
      block.remove();
      return;
    }
    const shown = panels.find(panel => panel.classList.contains('is-active')) ?? panels[0];
    panels.forEach(panel => {
      panel.classList.toggle('is-active', panel === shown);
      if (!panel.firstElementChild) panel.replaceChildren(Object.assign(document.createElement('p'), { innerHTML: '<br>' }));
    });
    Array.from(block.childNodes).filter(child => !panels.includes(child as Element)).forEach(child => {
      if (child.nodeType === Node.TEXT_NODE && !child.textContent?.trim()) child.remove();
      else shown.append(child);
    });
  });

  /* A canvas's text boxes sit side by side at the top, each with its id and at least one line. */
  /* One inside another (left by an edit or a paste) gives up its box and keeps its lines. */
  Array.from(safe.querySelectorAll('div.canvas-box')).forEach(box => {
    if (box.parentElement !== safe || !box.hasAttribute('data-box')) box.replaceWith(...Array.from(box.childNodes));
    else if (!box.firstElementChild) box.replaceChildren(Object.assign(document.createElement('p'), { innerHTML: '<br>' }));
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
