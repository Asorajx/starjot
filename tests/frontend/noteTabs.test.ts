import { describe, expect, it } from 'vitest';
import { closeTab, currentPlace, goTo, newTab, step, stepPlace, type Place } from '../../src/frontend/app/noteTabs';

const home: Place = { kind: 'home' };
const note = (id: string): Place => ({ kind: 'note', id });
const everything = () => true;


/* =========================
   Tab History
   ========================= */

describe('tab history', () => {
  it('goes back and forward through the places a tab has shown', () => {
    let tab = goTo(goTo(newTab(home), note('a')), note('b'));
    expect(currentPlace(tab)).toEqual(note('b'));

    tab = step(tab, -1, everything)!;
    expect(currentPlace(tab)).toEqual(note('a'));
    expect(stepPlace(tab, -1, everything)).toEqual(home);
    expect(stepPlace(tab, 1, everything)).toEqual(note('b'));

    tab = step(tab, 1, everything)!;
    expect(currentPlace(tab)).toEqual(note('b'));
    expect(step(tab, 1, everything)).toBeNull();
  });

  it('drops the forward places when going somewhere new, like a browser', () => {
    let tab = goTo(goTo(newTab(home), note('a')), note('b'));
    tab = step(tab, -1, everything)!;
    tab = goTo(tab, note('c'));
    expect(tab.history).toEqual([home, note('a'), note('c')]);
    expect(step(tab, 1, everything)).toBeNull();
  });

  it('does not add the place already shown again', () => {
    const tab = goTo(newTab(home), note('a'));
    expect(goTo(tab, note('a'))).toBe(tab);
  });

  it('skips places that no longer exist, such as deleted notes', () => {
    const tab = goTo(goTo(newTab(home), note('gone')), note('b'));
    const exists = (place: Place) => !('id' in place) || place.id !== 'gone';
    expect(currentPlace(step(tab, -1, exists)!)).toEqual(home);
  });

  it('keeps at most 50 places', () => {
    let tab = newTab(home);
    for (let index = 0; index < 60; index += 1) tab = goTo(tab, note(`n${index}`));
    expect(tab.history).toHaveLength(50);
    expect(currentPlace(tab)).toEqual(note('n59'));
  });
});


/* =========================
   Closing Tabs
   ========================= */

describe('closing tabs', () => {
  it('activates the tab beside the closed active tab', () => {
    const tabs = [newTab(home), newTab(note('a')), newTab(note('b'))];
    expect(closeTab(tabs, tabs[1].id, tabs[1].id)).toEqual({ tabs: [tabs[0], tabs[2]], active: tabs[0].id });
    expect(closeTab(tabs, tabs[0].id, tabs[0].id).active).toBe(tabs[1].id);
    expect(closeTab(tabs, tabs[2].id, tabs[0].id).active).toBe(tabs[2].id);
  });

  it('leaves one tab on the notes home after closing the last one', () => {
    const only = newTab(note('a'));
    const result = closeTab([only], only.id, only.id);
    expect(result.tabs).toHaveLength(1);
    expect(currentPlace(result.tabs[0])).toEqual(home);
    expect(result.active).toBe(result.tabs[0].id);
  });
});
