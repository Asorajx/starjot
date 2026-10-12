import { createLink } from '../editor/links/links';
import { getNote } from '../store';
import { isColorClass } from '../editor/format/colors';
import { keepPictures, splitIcon, type IdOf, type ImportedNote } from './imported';

/* Tags whose contents are never text in a note. */
const SKIPPED = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'HEAD', 'TITLE', 'META', 'LINK', 'SVG', 'CANVAS', 'IFRAME', 'OBJECT', 'EMBED', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'VIDEO', 'AUDIO']);

/* Lines of their own: the editor has headings down to level 5, so level 6 becomes level 5. */
const LINE_TAGS: Record<string, string> = { P: 'p', H1: 'h1', H2: 'h2', H3: 'h3', H4: 'h4', H5: 'h5', H6: 'h5' };

/* Tags that only hold other lines, such as a page's sections. Their lines are read in turn. */
const CONTAINERS = new Set(['BODY', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'FIGURE', 'FIGCAPTION', 'DETAILS', 'SUMMARY', 'CENTER', 'FORM', 'FIELDSET', 'ADDRESS', 'HGROUP', 'DL', 'DD', 'LI', 'CAPTION']);

/* Inline formatting the note keeps, by tag. Other inline tags keep only their words. */
const INLINE_TAGS: Record<string, string> = { B: 'strong', STRONG: 'strong', I: 'em', EM: 'em', U: 'u', INS: 'u', S: 's', STRIKE: 's', DEL: 's', CODE: 'code', KBD: 'code', SAMP: 'code', TT: 'code' };


/* =========================
   Inline Formatting
   ========================= */

/* Formatting written as a style (as Google Docs and Word do) instead of a tag: bold, italic, */
/* underline and strikethrough, outermost first. */
function styledTags(element: HTMLElement) {
  const style = element.style;
  const tags: string[] = [];
  const weight = style.fontWeight;
  if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600) tags.push('strong');
  if (style.fontStyle === 'italic') tags.push('em');
  const decoration = `${style.textDecoration} ${style.textDecorationLine}`;
  if (decoration.includes('underline')) tags.push('u');
  if (decoration.includes('line-through')) tags.push('s');
  return tags;
}

/* A copy of some inline content, with spaces tidied as a browser shows them and only the */
/* formatting a note keeps. Lines inside it (such as paragraphs in a list item) are joined by a */
/* line break. */
function inlineCopy(nodes: Iterable<Node>): Node[] {
  const copied: Node[] = [];
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      copied.push(document.createTextNode((node.textContent ?? '').replace(/\s+/g, ' ')));
      continue;
    }
    if (!(node instanceof HTMLElement) || SKIPPED.has(node.tagName)) continue;
    if (node.tagName === 'BR') {
      copied.push(document.createElement('br'));
      continue;
    }
    if (node.tagName === 'IMG') {
      copied.push(node.cloneNode());
      continue;
    }
    const children = inlineCopy(node.childNodes);
    if (LINE_TAGS[node.tagName] || CONTAINERS.has(node.tagName)) {
      if (copied.length && children.length) copied.push(document.createElement('br'));
      copied.push(...children);
      continue;
    }

    /* Google Docs wraps a whole document in <b style="font-weight: normal">, which is not bold. */
    let tag = INLINE_TAGS[node.tagName];
    if (tag === 'strong' && /normal|^[1-5]00$/.test(node.style.fontWeight)) tag = '';
    let wrapped: Node[] = children;
    [...styledTags(node)].reverse().forEach(styled => {
      const holder = document.createElement(styled);
      holder.append(...wrapped);
      wrapped = [holder];
    });
    /* Starjot's own text and highlight colours are classes, so they come back too. */
    const colors = Array.from(node.classList).filter(isColorClass);
    if (tag || node.tagName === 'A' || colors.length) {
      const kept = document.createElement(node.tagName === 'A' ? 'a' : tag || 'span');
      if (node.tagName === 'A') kept.setAttribute('href', node.getAttribute('href') ?? '');
      if (colors.length) kept.className = colors.join(' ');
      kept.append(...wrapped);
      copied.push(kept);
    } else {
      copied.push(...wrapped);
    }
  }
  return copied;
}

/* A line holding the inline content of an element, without spaces at its ends. Null when it */
/* has no words or pictures. */
function lineOf(tag: string, nodes: Iterable<Node>) {
  const line = document.createElement(tag);
  line.append(...inlineCopy(nodes));
  line.normalize();
  const first = line.firstChild;
  const last = line.lastChild;
  if (first?.nodeType === Node.TEXT_NODE) first.textContent = (first.textContent ?? '').trimStart();
  if (last?.nodeType === Node.TEXT_NODE) last.textContent = (last.textContent ?? '').trimEnd();
  while (line.lastChild?.nodeName === 'BR') line.lastChild.remove();
  return line.textContent?.trim() || line.querySelector('img') ? line : null;
}


/* =========================
   Lines
   ========================= */

/* A list, with lists inside its items kept inside them. */
function listOf(list: Element) {
  const copy = document.createElement(list.tagName === 'OL' ? 'ol' : 'ul');
  for (const child of Array.from(list.children)) {
    if (child.tagName === 'UL' || child.tagName === 'OL') {
      /* A list written straight inside a list belongs to the item before it. */
      (copy.lastElementChild ?? copy).append(listOf(child));
      continue;
    }
    const words = Array.from(child.childNodes).filter(node => !(node instanceof Element && ['UL', 'OL'].includes(node.tagName)));
    const item = lineOf('li', words) ?? document.createElement('li');
    if (!item.childNodes.length) item.append(document.createElement('br'));
    child.querySelectorAll(':scope > ul, :scope > ol').forEach(nested => item.append(listOf(nested)));
    copy.append(item);
  }
  return copy;
}

/* A table, its first row a header row when the file marks it as one. */
function tableOf(table: HTMLTableElement) {
  const copy = document.createElement('table');
  copy.className = 'fit-content';
  const body = copy.appendChild(document.createElement('tbody'));
  for (const row of Array.from(table.rows)) {
    const line = body.appendChild(document.createElement('tr'));
    const header = row.parentElement?.tagName === 'THEAD';
    for (const cell of Array.from(row.cells)) {
      const kept = lineOf(header || cell.tagName === 'TH' ? 'th' : 'td', cell.childNodes) ?? document.createElement(header || cell.tagName === 'TH' ? 'th' : 'td');
      if (!kept.childNodes.length) kept.append(document.createElement('br'));
      ['colspan', 'rowspan'].forEach(name => {
        const span = cell.getAttribute(name);
        if (span) kept.setAttribute(name, span);
      });
      line.append(kept);
    }
  }
  return copy;
}

/* A code block, keeping its language when the file names one (class="language-…"). */
function codeOf(pre: Element) {
  const copy = document.createElement('pre');
  const code = copy.appendChild(document.createElement('code'));
  code.textContent = pre.textContent ?? '';
  const language = `${pre.className} ${pre.querySelector('code')?.className ?? ''}`.match(/language-([a-z]+)/i)?.[1];
  if (language) code.className = `language-${language.toLowerCase()}`;
  return copy;
}

/* The note lines inside an element: headings, paragraphs, lists, quotes, code, tables and */
/* dividers. Words that sit straight inside a section become paragraphs, split at line breaks. */
function linesOf(root: Element) {
  const lines: Element[] = [];
  let loose: Node[] = [];
  const flush = () => {
    const line = lineOf('p', loose);
    if (line) lines.push(line);
    loose = [];
  };

  for (const node of Array.from(root.childNodes)) {
    if (!(node instanceof HTMLElement)) {
      if (node.nodeType === Node.TEXT_NODE) loose.push(node);
      continue;
    }
    const tag = node.tagName;
    if (SKIPPED.has(tag)) continue;
    if (tag === 'BR') {
      flush();
    } else if (LINE_TAGS[tag]) {
      flush();
      const line = lineOf(LINE_TAGS[tag], node.childNodes);
      if (line) lines.push(line);
    } else if (tag === 'UL' || tag === 'OL') {
      flush();
      lines.push(listOf(node));
    } else if (tag === 'BLOCKQUOTE') {
      /* A quote holds lines of text, so its headings and lists become plain lines. */
      flush();
      const quote = document.createElement('blockquote');
      linesOf(node).forEach(line => {
        const text = line.tagName === 'P' ? line : lineOf('p', line.tagName === 'UL' || line.tagName === 'OL' ? line.querySelectorAll('li') : line.childNodes);
        if (text) quote.append(text);
      });
      if (quote.childNodes.length) lines.push(quote);
    } else if (tag === 'PRE') {
      flush();
      lines.push(codeOf(node));
    } else if (tag === 'TABLE') {
      flush();
      lines.push(tableOf(node as HTMLTableElement));
    } else if (tag === 'HR') {
      flush();
      lines.push(document.createElement('hr'));
    } else if (tag === 'DT') {
      flush();
      /* A term in a list of terms (such as "Category" in Starjot's details) is a bold line. */
      const term = lineOf('p', node.childNodes);
      if (term) {
        const bold = document.createElement('strong');
        bold.append(...Array.from(term.childNodes));
        term.append(bold);
        lines.push(term);
      }
    } else if (CONTAINERS.has(tag)) {
      flush();
      lines.push(...linesOf(node));
    } else {
      loose.push(node);
    }
  }
  flush();
  return lines;
}


/* =========================
   Starjot Exports
   ========================= */

/* Starjot's exports turn sub-note cards, mentions and note links into links. Put them back as */
/* they were, leading to the new notes. A link to a note neither in the file nor in this browser */
/* keeps only its words. */
function restoreNoteLinks(root: Element, idOf: IdOf) {
  root.querySelectorAll<HTMLElement>('a.page-block[data-page], a.page-mention[data-page]').forEach(element => {
    const id = idOf(element.dataset.page ?? '');
    const isBlock = element.classList.contains('page-block');
    if (!id) {
      element.replaceWith(element.querySelector(isBlock ? '.page-block-text strong' : '.page-mention-title')?.textContent ?? '');
      return;
    }
    const restored = document.createElement('span');
    restored.className = isBlock ? 'page-block' : 'page-mention';
    restored.dataset.page = id;
    if (element.dataset.size) restored.dataset.size = element.dataset.size;
    if (element.dataset.width) restored.dataset.width = element.dataset.width;
    element.replaceWith(restored);
  });
  root.querySelectorAll<HTMLElement>('a.page-link[data-page]').forEach(element => {
    const id = idOf(element.dataset.page ?? '');
    if (!id) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }
    const link = createLink('', { kind: 'page', id });
    link.append(...Array.from(element.childNodes));
    element.replaceWith(link);
  });
}

/* Starjot's own markup, as an export wrote it: links put back and pictures kept again. */
async function restoredMarkup(source: Element | null, idOf: IdOf) {
  if (!source) return '';
  const root = source.cloneNode(true) as Element;
  restoreNoteLinks(root, idOf);
  await keepPictures(root);
  return root.innerHTML;
}

/* One note of a Starjot HTML export: its icon, title, details, remarks and text. Created dates */
/* are not kept, as an imported note is new. Remarks are read straight away, so their links can */
/* only lead to notes already in this browser. */
async function exportedNote(article: Element, fallbackTitle: string): Promise<ImportedNote> {
  const details = new Map<string, string>();
  article.querySelectorAll('.note-details > dt').forEach(term => {
    const value = term.nextElementSibling;
    if (value?.tagName === 'DD') details.set(term.textContent?.trim() ?? '', value.textContent?.trim() ?? '');
  });
  const heading = article.querySelector('.note-title-input')?.textContent?.trim() || fallbackTitle;
  const icon = article.querySelector('.note-icon')?.textContent?.trim() ?? '';
  return {
    key: article.id.replace(/^page-/, ''),
    title: heading,
    icon: splitIcon(`${icon} ${heading}`).icon,
    description: details.get('Description'),
    category: details.get('Category'),
    remarks: await restoredMarkup(article.querySelector('.note-remarks'), key => (getNote(key) ? key : undefined)),
    content: idOf => restoredMarkup(article.querySelector('.note-body'), idOf)
  };
}


/* =========================
   Reading HTML
   ========================= */

/* The notes in an HTML file. A Starjot export gives its note and sub-notes back as they were; */
/* any other page becomes one note, titled by the page's title or first heading. */
export async function readHtml(text: string, fallbackTitle: string): Promise<ImportedNote[]> {
  const page = new DOMParser().parseFromString(text, 'text/html');
  const articles = Array.from(page.querySelectorAll('article.export-page'));
  if (articles.length) {
    return Promise.all(articles.map(article => exportedNote(article, fallbackTitle)));
  }

  const lines = linesOf(page.body);

  /* A first heading that repeats the title (or gives the only title) is the title, not text. */
  const first = lines[0];
  const pageTitle = page.title.trim();
  const titledByHeading = first?.tagName === 'H1' && (!pageTitle || first.textContent?.trim() === pageTitle);
  const title = pageTitle || (titledByHeading ? first.textContent?.trim() : '') || fallbackTitle;
  if (titledByHeading) lines.shift();

  return [{
    key: 'main',
    title,
    content: async () => {
      const root = document.createElement('div');
      root.append(...lines);
      await keepPictures(root);
      return root.innerHTML;
    }
  }];
}
