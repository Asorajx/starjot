import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blockWords, dropTakenLinkIds, linkableBlock, linkIdOf, LINK_ID, onRevealAsked, revealBlock, revealWhenShown, takeReveal } from '../../../../../src/frontend/notespace/editor/links/blockLinks';
import { copiedPageLink, linkTarget, pageAddress, pageTargetFromAddress, setLinkTarget } from '../../../../../src/frontend/notespace/editor/links/links';
import { cleanHtml } from '../../../../../src/frontend/notespace/sanitize';
import { blockInAddress, parseAddress } from '../../../../../src/frontend/app/address';
import { toggleStickyRange } from '../../../../../src/frontend/notespace/editor/text/stickyDom';
import { parseBlocks, serializeBlocks, stickBlocks } from '../../../../../src/frontend/notespace/editor/text/blockModel';

/* A note's editable text, added to the test page. */
function editor(html: string) {
  const body = document.createElement('div');
  body.contentEditable = 'true';
  body.innerHTML = html;
  document.body.replaceChildren(body);
  return body;
}

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});


/* =========================
   Block Ids
   ========================= */

describe('block link ids', () => {
  it('gives a block an id once, and finds the block around the caret', () => {
    const body = editor('<p>One</p><ul><li>Item</li></ul><table><tbody><tr><td>Cell</td></tr></tbody></table>');
    const paragraph = body.querySelector('p') as HTMLElement;
    const id = linkIdOf(paragraph);
    expect(LINK_ID.test(id)).toBe(true);
    expect(linkIdOf(paragraph)).toBe(id);
    expect(linkableBlock(body.querySelector('li')?.firstChild ?? null, body)?.tagName).toBe('LI');
    expect(linkableBlock(body.querySelector('td')?.firstChild ?? null, body)?.tagName).toBe('TABLE');
    expect(linkableBlock(body, body)).toBeNull();
  });

  it('keeps ids through saving, on blocks and on links, and drops made-up ones', () => {
    const saved = cleanHtml('<h2 data-link-id="labc1234">Plan</h2><p data-link-id="nope">Text</p><p><a class="page-link" data-page="atlas" data-link-id="labc1234">see</a></p>');
    expect(saved).toBe('<h2 data-link-id="labc1234">Plan</h2><p>Text</p><p><a class="page-link" data-link-id="labc1234" data-page="atlas">see</a></p>');
  });

  it('leaves a repeated id on the first block only, as when a block is split', () => {
    const saved = cleanHtml('<p data-link-id="labc1234">First half</p><p data-link-id="labc1234">second half</p>');
    expect(saved).toBe('<p data-link-id="labc1234">First half</p><p>second half</p>');
  });

  it('drops ids a pasted copy would share with the note, keeping new ones', () => {
    const body = editor('<p data-link-id="labc1234">Original</p>');
    const copy = document.createElement('p');
    copy.dataset.linkId = 'labc1234';
    const other = document.createElement('p');
    other.dataset.linkId = 'lzzz9999';
    dropTakenLinkIds([copy, other], body);
    expect(copy.hasAttribute('data-link-id')).toBe(false);
    expect(other.dataset.linkId).toBe('lzzz9999');
  });

  it('shortens a block\'s words for a link', () => {
    const block = document.createElement('p');
    block.textContent = 'A rather long paragraph that goes on and on well past the point where a link should stop';
    expect(blockWords(block, 20)).toBe('A rather long parag…');
  });
});


/* =========================
   Sticky Groups
   ========================= */

describe('block links in sticky groups', () => {
  it('keeps a block\'s id when it is made sticky and unstuck in a continuous note', () => {
    const body = editor('<p data-link-id="labc1234">Keep me</p><p>Next</p>');
    const range = document.createRange();
    range.selectNodeContents(body);
    toggleStickyRange(body, range);
    expect(body.querySelector('.sticky-group [data-link-id="labc1234"]')).not.toBeNull();
    range.selectNodeContents(body);
    toggleStickyRange(body, range);
    expect(body.querySelector('.sticky-group')).toBeNull();
    expect(body.querySelector('[data-link-id="labc1234"]')?.textContent).toBe('Keep me');
  });

  it('keeps a block\'s id when blocks are grouped in Block mode', () => {
    const blocks = parseBlocks('<p data-link-id="labc1234">Keep me</p><p>Next</p>');
    const html = serializeBlocks(stickBlocks(blocks, blocks.map(block => block.id)));
    expect(html).toContain('sticky-group');
    expect(html).toContain('data-link-id="labc1234"');
  });
});


/* =========================
   Links and Addresses
   ========================= */

describe('links to blocks', () => {
  it('reads and writes a link\'s block, and drops it when the link becomes a web link', () => {
    const link = document.createElement('a');
    setLinkTarget(link, { kind: 'page', id: 'atlas', block: 'labc1234' });
    expect(linkTarget(link)).toEqual({ kind: 'page', id: 'atlas', block: 'labc1234' });
    setLinkTarget(link, { kind: 'url', href: 'https://example.com' });
    expect(link.hasAttribute('data-link-id')).toBe(false);
  });

  it('puts the block in a note\'s address and reads it back', () => {
    const address = pageAddress('atlas', 'labc1234');
    expect(address.endsWith('#note=atlas&block=labc1234')).toBe(true);
    expect(pageTargetFromAddress(address)).toEqual({ id: 'atlas', block: 'labc1234' });
    expect(pageTargetFromAddress(pageAddress('atlas'))).toEqual({ id: 'atlas', block: undefined });
    expect(parseAddress('#note=atlas&block=labc1234')).toEqual({ kind: 'place', place: { kind: 'note', id: 'atlas' } });
    expect(blockInAddress('#note=atlas&block=labc1234')).toBe('labc1234');
    expect(blockInAddress('#note=atlas')).toBeNull();
  });

  it('pastes a copied block link back as a block link with the block\'s words', () => {
    const address = pageAddress('atlas', 'labc1234');
    const html = `<a class="page-link" data-page="atlas" data-link-id="labc1234" href="${address}">Plan</a>`;
    expect(copiedPageLink(html, address)).toEqual({ target: { kind: 'page', id: 'atlas', block: 'labc1234' }, words: 'Plan' });
  });
});


/* =========================
   Showing Linked Blocks
   ========================= */

describe('showing a linked block', () => {
  it('highlights the block, and says so calmly when it was deleted', () => {
    const body = editor('<p data-link-id="labc1234">Here</p>');
    const block = body.querySelector('p') as HTMLElement;
    block.scrollIntoView = () => undefined;
    expect(revealBlock(body, 'labc1234')).toBe(true);
    expect(block.classList.contains('is-link-target')).toBe(true);
    expect(revealBlock(body, 'lgone0000')).toBe(false);
  });

  it('waits for the linked note to open, and only that note takes it', () => {
    revealWhenShown('atlas', 'labc1234');
    expect(takeReveal('weekly')).toBeNull();
    expect(takeReveal('atlas')).toBe('labc1234');
    expect(takeReveal('atlas')).toBeNull();
  });

  it('tells an editor already showing the note straight away', () => {
    const asked = vi.fn();
    const stop = onRevealAsked(asked);
    revealWhenShown('atlas', 'labc1234');
    stop();
    revealWhenShown('atlas', 'labc1234');
    expect(asked).toHaveBeenCalledTimes(1);
    takeReveal('atlas');
  });

  it('keeps block ids in a note through saving and opening again', async () => {
    let store = await import('../../../../../src/frontend/notespace/store');
    const note = store.createNote();
    store.updateNote(note.id, { content: '<h2 data-link-id="labc1234">Plan</h2><p>Text</p>' });
    vi.resetModules();
    store = await import('../../../../../src/frontend/notespace/store');
    expect(store.getNote(note.id)?.content).toContain('data-link-id="labc1234"');
  });
});
