import { describe, expect, it } from 'vitest';
import {
  copiedPageLink, createLink, linkTarget, linkTypedAddress, normalizeAddress, pageAddress, pageIdFromAddress, setLinkTarget, textWithAddresses, trimAddress,
  unwrapLink
} from '../../../../../src/frontend/notespace/editor/links/links';


/* =========================
   Addresses
   ========================= */

describe('normalizeAddress', () => {
  it('keeps web and email addresses', () => {
    expect(normalizeAddress('https://google.com/')).toBe('https://google.com/');
    expect(normalizeAddress(' mailto:a@b.com ')).toBe('mailto:a@b.com');
  });

  it('adds https to addresses typed without it', () => {
    expect(normalizeAddress('google.com')).toBe('https://google.com');
    expect(normalizeAddress('www.example.org/news?id=1')).toBe('https://www.example.org/news?id=1');
    expect(normalizeAddress('localhost:5173')).toBe('https://localhost:5173');
  });

  it('turns email addresses into mailto links', () => {
    expect(normalizeAddress('someone@example.com')).toBe('mailto:someone@example.com');
  });

  it('rejects addresses that could run script, and words that are not addresses', () => {
    expect(normalizeAddress('javascript:alert(1)')).toBeNull();
    expect(normalizeAddress('data:text/html,hi')).toBeNull();
    expect(normalizeAddress('/notes/page')).toBeNull();
    expect(normalizeAddress('My page')).toBeNull();
    expect(normalizeAddress('')).toBeNull();
  });
});


/* =========================
   Changing Links
   ========================= */

describe('link targets', () => {
  it('turns an address link into a page link and back', () => {
    const link = createLink('Plan', { kind: 'url', href: 'https://example.com' });
    expect(linkTarget(link)).toEqual({ kind: 'url', href: 'https://example.com' });

    setLinkTarget(link, { kind: 'page', id: 'n1' });
    expect(link.outerHTML).toBe('<a class="page-link" data-page="n1">Plan</a>');
    expect(linkTarget(link)).toEqual({ kind: 'page', id: 'n1' });

    setLinkTarget(link, { kind: 'url', href: 'https://example.org' });
    expect(link.outerHTML).toBe('<a href="https://example.org">Plan</a>');
  });

  it('ignores a link whose address could run script', () => {
    const link = document.createElement('a');
    link.setAttribute('href', 'javascript:alert(1)');
    expect(linkTarget(link)).toBeNull();
  });

  it('removes a link but keeps its words', () => {
    const line = document.createElement('p');
    line.innerHTML = 'Open <a href="https://example.com">the <strong>site</strong></a> now';
    unwrapLink(line.querySelector('a') as HTMLAnchorElement);
    expect(line.innerHTML).toBe('Open the <strong>site</strong> now');
  });
});

describe('copiedPageLink', () => {
  it('reads one page link copied from a note', () => {
    expect(copiedPageLink('<a class="page-link" data-page="n1">Plan</a>', 'Plan')).toEqual({ kind: 'page', id: 'n1' });
  });

  it('ignores other HTML, other words and unsafe page ids', () => {
    expect(copiedPageLink('<a href="https://example.com">Plan</a>', 'Plan')).toBeNull();
    expect(copiedPageLink('<a class="page-link" data-page="n1">Plan</a>', 'Other')).toBeNull();
    expect(copiedPageLink('<a class="page-link" data-page="n 1">Plan</a>', 'Plan')).toBeNull();
    expect(copiedPageLink('', 'Plan')).toBeNull();
  });
});


/* =========================
   Page Addresses
   ========================= */

describe('page addresses', () => {
  it('makes an address for a page that can be read back', () => {
    const address = pageAddress('note_abc');
    expect(address.endsWith('#note=note_abc')).toBe(true);
    expect(pageIdFromAddress(address)).toBe('note_abc');
  });

  it('reads page addresses from any site, and nothing else', () => {
    expect(pageIdFromAddress('https://starjot.example/app/#note=atlas')).toBe('atlas');
    expect(pageIdFromAddress('https://google.com')).toBeNull();
    expect(pageIdFromAddress('see https://x.com/#note=atlas')).toBeNull();
  });
});


/* =========================
   Addresses in Text
   ========================= */

describe('addresses in text', () => {
  it('leaves sentence punctuation and unopened brackets out of an address', () => {
    expect(trimAddress('https://a.com/page.')).toEqual({ address: 'https://a.com/page', rest: '.' });
    expect(trimAddress('https://a.com/x),')).toEqual({ address: 'https://a.com/x', rest: '),' });
    expect(trimAddress('https://en.wikipedia.org/wiki/Rust_(language)').address).toBe('https://en.wikipedia.org/wiki/Rust_(language)');
  });

  it('splits text into words and web addresses', () => {
    expect(textWithAddresses('See www.a.com, then https://b.com/x.')).toEqual([
      { text: 'See ' },
      { href: 'https://www.a.com', text: 'www.a.com' },
      { text: ',' },
      { text: ' then ' },
      { href: 'https://b.com/x', text: 'https://b.com/x' },
      { text: '.' }
    ]);
  });
});


/* =========================
   Typed Addresses
   ========================= */

/* A line with the caret at its end, as if the text was just typed. */
function typed(text: string) {
  const line = document.createElement('p');
  line.textContent = text;
  document.body.replaceChildren(line);
  const caret = document.createRange();
  caret.setStart(line.firstChild as Node, text.length);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(caret);
  return line;
}

describe('linkTypedAddress', () => {
  it('links web addresses typed with or without https:// and www.', () => {
    for (const [text, href] of [['https://www.youtube.com', 'https://www.youtube.com'], ['www.youtube.com', 'https://www.youtube.com'], ['youtube.com', 'https://youtube.com']]) {
      const line = typed(`Watch ${text}`);
      expect(linkTypedAddress(line)).toBe(true);
      expect(line.innerHTML).toBe(`Watch <a href="${href}">${text}</a>`);
    }
  });

  it('leaves punctuation after the address as text, with the caret after it', () => {
    const line = typed('See google.com.');
    linkTypedAddress(line);
    expect(line.innerHTML).toBe('See <a href="https://google.com">google.com</a>.');
    expect(window.getSelection()?.anchorOffset).toBe(1);
  });

  it('does nothing when there is no word before the caret (an empty line, or after a space)', () => {
    expect(trimAddress('')).toEqual({ address: '', rest: '' });
    expect(linkTypedAddress(typed('Hello '))).toBe(false);
    const empty = document.createElement('p');
    document.body.replaceChildren(empty);
    expect(linkTypedAddress(empty)).toBe(false);
  });

  it('leaves words that only look like names, such as file names, as text', () => {
    for (const text of ['notes.txt', 'Node.js', 'e.g.', 'hello']) {
      const line = typed(text);
      expect(linkTypedAddress(line)).toBe(false);
      expect(line.innerHTML).toBe(text);
    }
  });
});
