import { describe, expect, it } from 'vitest';
import {
  activeTab, addTab, closeTab, currentPlace, focusedGroup, goTo, isOpenInStack, moveTab, newTab, newWorkspace, selectTab, splitWorkspace,
  stackGroup, step, stepPlace, unsplit, type Place, type Workspace
} from '../../src/frontend/app/noteTabs';

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
   Tab Groups
   ========================= */

/* The place each tab of each group shows. */
const places = (workspace: Workspace) => workspace.groups.map(group => group.tabs.map(currentPlace));

describe('closing tabs', () => {
  it('activates the tab beside the closed active tab', () => {
    let workspace = newWorkspace(home);
    const group = workspace.groups[0].id;
    workspace = addTab(addTab(workspace, group, newTab(note('a'))), group, newTab(note('b')));
    const [first, second] = workspace.groups[0].tabs;
    workspace = selectTab(workspace, group, second.id);
    workspace = closeTab(workspace, group, second.id);
    expect(workspace.groups[0].active).toBe(first.id);
  });

  it('leaves one tab on the notes home after closing the last one', () => {
    const workspace = newWorkspace(note('a'));
    const group = workspace.groups[0];
    const closed = closeTab(workspace, group.id, group.tabs[0].id);
    expect(places(closed)).toEqual([[home]]);
  });
});

describe('split windows', () => {
  it('adds a second tab group with its own tab, showing the same note', () => {
    const workspace = splitWorkspace(newWorkspace(note('a')), 'right');
    expect(places(workspace)).toEqual([[note('a')], [note('a')]]);
    expect(workspace.direction).toBe('right');
    expect(workspace.focus).toBe(workspace.groups[1].id);
  });

  it('only turns a split window that is already split', () => {
    const workspace = splitWorkspace(newWorkspace(note('a')), 'right');
    const turned = splitWorkspace(workspace, 'down');
    expect(turned.direction).toBe('down');
    expect(turned.groups).toBe(workspace.groups);
  });

  it('closes a group once its last tab is closed', () => {
    const workspace = splitWorkspace(newWorkspace(note('a')), 'down');
    const second = workspace.groups[1];
    const closed = closeTab(workspace, second.id, second.tabs[0].id);
    expect(closed.groups).toHaveLength(1);
    expect(closed.focus).toBe(closed.groups[0].id);
  });

  it('unsplits when the last tab of a group is dragged into the other group', () => {
    const workspace = splitWorkspace(newWorkspace(note('a')), 'right');
    const [left, right] = workspace.groups;
    const moved = moveTab(workspace, right.id, right.tabs[0].id, left.id);
    expect(moved.groups).toHaveLength(1);
    expect(places(moved)).toEqual([[note('a'), note('a')]]);
    expect(moved.groups[0].active).toBe(right.tabs[0].id);
    expect(moved.focus).toBe(left.id);
  });

  it('moves a tab before another tab, and reorders tabs within a group', () => {
    let workspace = newWorkspace(note('a'));
    const group = workspace.groups[0].id;
    workspace = addTab(addTab(workspace, group, newTab(note('b'))), group, newTab(note('c')));
    const [a, , c] = workspace.groups[0].tabs;
    const moved = moveTab(workspace, group, c.id, group, a.id);
    expect(places(moved)).toEqual([[note('c'), note('a'), note('b')]]);
  });

  it('puts every tab back into one tab strip when unsplit, keeping the focused tab active', () => {
    let workspace = splitWorkspace(newWorkspace(note('a')), 'right');
    workspace = addTab(workspace, workspace.groups[1].id, newTab(note('b')));
    const merged = unsplit(workspace);
    expect(places(merged)).toEqual([[note('a'), note('a'), note('b')]]);
    expect(currentPlace(activeTab(merged.groups[0]))).toEqual(note('b'));
    expect(merged.groups[0].stacked).toBe(false);
  });
});

describe('stacked tabs', () => {
  it('stacks a group, adding a tab with the same note, up to five tabs', () => {
    let workspace = stackGroup(newWorkspace(note('a')));
    const group = () => focusedGroup(workspace);
    expect(group().stacked).toBe(true);
    expect(places(workspace)).toEqual([[note('a'), note('a')]]);
    for (let count = 0; count < 5; count += 1) workspace = stackGroup(workspace);
    expect(group().tabs).toHaveLength(5);
    expect(addTab(workspace, group().id, newTab(home))).toBe(workspace);
  });

  it('opens the active tab with one neighbour, sliding along when a folded tab is opened', () => {
    let workspace = stackGroup(stackGroup(stackGroup(stackGroup(newWorkspace(note('a'))))));
    const group = () => focusedGroup(workspace);
    const open = () => group().tabs.map((_, index) => isOpenInStack(group(), index));
    expect(open()).toEqual([false, false, false, true, true]);

    workspace = selectTab(workspace, group().id, group().tabs[1].id);
    expect(open()).toEqual([false, true, true, false, false]);

    workspace = selectTab(workspace, group().id, group().tabs[2].id);
    expect(open()).toEqual([false, true, true, false, false]);
  });

  it('becomes a normal group when one tab is left', () => {
    const workspace = stackGroup(newWorkspace(note('a')));
    const group = workspace.groups[0];
    expect(closeTab(workspace, group.id, group.tabs[1].id).groups[0].stacked).toBe(false);
  });
});
