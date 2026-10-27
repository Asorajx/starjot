import { beforeEach, describe, expect, it, vi } from 'vitest';
import { linkableBlocks, blockWords } from '../../../../../src/frontend/notespace/editor/links/blockLinks';
import { linkSelection } from '../../../../../src/frontend/notespace/editor/links/links';
import { matchCommands } from '../../../../../src/frontend/notespace/editor/text/slashCommands';

/* An editable note body with the words between "[" and "]" selected (or none without them). */
function editor(html: string) {
  const body = document.createElement('div');
  body.contentEditable = 'true';
  body.innerHTML = html.replace('[', '<span id="from"></span>').replace(']', '<span id="to"></span>');
  document.body.replaceChildren(body);
  const from = body.querySelector('#from');
  const to = body.querySelector('#to');
  if (from && to) {
    const range = document.createRange();
    range.setStartAfter(from);
    range.setEndBefore(to);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }
  return body;
}

/* The body's HTML without the selection markers. */
function html(body: HTMLElement) {
  body.querySelectorAll('#from, #to').forEach(mark => mark.remove());
  body.normalize();
  return body.innerHTML;
}

/* A Ctrl + K key press. */
function ctrlK() {
  return new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
}

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});


/* =========================
   Blocks to Choose From
   ========================= */

describe('the blocks a link can lead to', () => {
  it('lists each block with words once, in order, leaving out empty lines and widgets', () => {
    const body = editor('<h2>Plan</h2><p></p><ul><li>One</li><li>Two</li></ul><p><span class="page-mention" data-page="atlas">Atlas</span></p><table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>');
    expect(linkableBlocks(body).map(block => block.tagName)).toEqual(['H2', 'LI', 'LI', 'TABLE']);
    expect(blockWords(body.querySelector('table') as Element)).toBe('A B');
  });

  it('lists another note\'s blocks from its saved text, and gives the chosen one an id that is saved', async () => {
    const store = await import('../../../../../src/frontend/notespace/store');
    const { blockChoices, linkIdForBlock } = await import('../../../../../src/frontend/notespace/editor/links/blockChoices');
    const note = store.createNote();
    store.updateNote(note.id, { content: '<h2>Goals</h2><p>Ship it</p>' });
    expect(blockChoices(note.id, null)).toEqual([
      { index: 0, words: 'Goals', icon: 'type' },
      { index: 1, words: 'Ship it', icon: 'align-left' }
    ]);
    const id = linkIdForBlock(note.id, 1, null) as string;
    expect(store.getNote(note.id)?.content).toBe(`<h2>Goals</h2><p data-link-id="${id}">Ship it</p>`);

    /* Linking it again keeps the same id. */
    expect(linkIdForBlock(note.id, 1, null)).toBe(id);
    expect(linkIdForBlock(note.id, 5, null)).toBeNull();
  });

  it('gives a block in the open editor an id in the page, to be saved with the new link', async () => {
    const { blockChoices, linkIdForBlock } = await import('../../../../../src/frontend/notespace/editor/links/blockChoices');
    const body = editor('<p>Here</p><blockquote>Quote</blockquote>');
    expect(blockChoices('any', body).map(choice => choice.icon)).toEqual(['align-left', 'quote']);
    const id = linkIdForBlock('any', 1, body);
    expect(body.querySelector('blockquote')?.getAttribute('data-link-id')).toBe(id);
  });
});


/* =========================
   Linking Selected Words
   ========================= */

describe('linking selected words', () => {
  it('links the words to a note, a block or an address, keeping them', () => {
    const body = editor('<p>See [the plan] now</p>');
    expect(linkSelection(body, { kind: 'page', id: 'atlas', block: 'labc1234' })).toBe(true);
    expect(html(body)).toBe('<p>See <a class="page-link" data-page="atlas" data-link-id="labc1234">the plan</a> now</p>');
  });

  it('changes nothing with no words selected, across lines, or in code', () => {
    expect(linkSelection(editor('<p>Nothing</p>'), { kind: 'url', href: 'https://example.com' })).toBe(false);
    const across = editor('<p>[one</p><p>two]</p>');
    expect(linkSelection(across, { kind: 'url', href: 'https://example.com' })).toBe(false);
    expect(html(across)).toBe('<p>one</p><p>two</p>');
    expect(linkSelection(editor('<pre><code>[x]</code></pre>'), { kind: 'url', href: 'https://example.com' })).toBe(false);
  });
});


/* =========================
   Add Link Command and Ctrl + K
   ========================= */

describe('Add link', () => {
  it('is the "/" command for links, still found by its old name', () => {
    const anywhere = { inlineOnly: false, canAddPage: true };
    expect(matchCommands('add link', anywhere).map(command => command.label)).toContain('Add link');
    expect(matchCommands('link to note', anywhere).map(command => command.label)).toContain('Add link');
    expect(matchCommands('mention', anywhere).map(command => command.label)).toContain('Add link');
    expect(matchCommands('', anywhere).some(command => command.label === 'Link to note')).toBe(false);
  });

  it('takes Ctrl + K in a note unless another shortcut was given it', async () => {
    const shortcuts = await import('../../../../../src/frontend/app/shortcuts');
    const preferences = await import('../../../../../src/frontend/app/preferences');
    expect(shortcuts.isLinkShortcut(ctrlK())).toBe(true);
    expect(shortcuts.isLinkShortcut(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, shiftKey: true }))).toBe(false);

    /* Search moved elsewhere: Ctrl + K still links in a note. */
    preferences.updatePreferences({ shortcuts: { search: 'Ctrl+Shift+F' } });
    expect(shortcuts.isLinkShortcut(ctrlK())).toBe(true);

    /* Ctrl + K given to another shortcut: that shortcut keeps it. */
    preferences.updatePreferences({ shortcuts: { search: 'Ctrl+Shift+F', find: 'Ctrl+K' } });
    expect(shortcuts.isLinkShortcut(ctrlK())).toBe(false);
  });
});
