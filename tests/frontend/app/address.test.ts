import { describe, expect, it } from 'vitest';
import { addressOf, parseAddress, type Address } from '../../../src/frontend/app/address';


/* =========================
   Page Addresses
   ========================= */

describe('page addresses', () => {
  const places: [Address, string][] = [
    [{ kind: 'place', place: { kind: 'start' } }, '#home'],
    [{ kind: 'place', place: { kind: 'home' } }, '#notes'],
    [{ kind: 'place', place: { kind: 'category', id: 'cat_work' } }, '#category=cat_work'],
    [{ kind: 'place', place: { kind: 'note', id: 'note_abc-1' } }, '#note=note_abc-1'],
    [{ kind: 'board', view: 'timeline' }, '#board=timeline']
  ];

  it('writes each place as an address and reads it back', () => {
    for (const [address, hash] of places) {
      expect(addressOf(address)).toBe(hash);
      expect(parseAddress(hash)).toEqual(address);
    }
  });

  it('keeps reading note links in the form they have always had', () => {
    expect(parseAddress('#note=atlas')).toEqual({ kind: 'place', place: { kind: 'note', id: 'atlas' } });
  });

  it('opens the Board for links to the removed status views', () => {
    for (const view of ['todo', 'progress', 'review', 'done']) {
      expect(parseAddress(`#board=${view}`)).toEqual({ kind: 'board', view: 'board' });
    }
  });

  it('ignores addresses it does not know', () => {
    for (const hash of ['', '#', '#settings', '#board=garden', '#note=', '#note=<script>', '#home=1', '#category=a b']) {
      expect(parseAddress(hash)).toBeNull();
    }
  });
});
