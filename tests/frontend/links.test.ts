import { describe, expect, it } from 'vitest';
import { copiedPageLink, createLink, linkTarget, normalizeAddress, setLinkTarget, unwrapLink } from '../../src/frontend/notespace/editor/links';


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
