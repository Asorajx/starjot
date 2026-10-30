import { describe, expect, it } from 'vitest';
import { addImportedTabs } from '../../../src/frontend/app/noteTabs';
import {
  activeTab, addBackgroundTab, addTab, closeTab, currentPlace, cycleTab, focusedGroup, goTo, isOpenInStack, moveTab, newTab, newWorkspace, reopenLastClosed, reopenTab, restoreWorkspace, continueIdsAfter, selectTab, updateTab,
  splitWithTab, splitWorkspace, stackGroup, step, stepPlace, unsplit, type Place, type Workspace
} from '../../../src/frontend/app/noteTabs';

const home: Place = { kind: 'home' };
const note = (id: string): Place => ({ kind: 'note', id });
const everything = () => true;

describe('imported file tabs', () => {
  it('opens every file in order and focuses the first without replacing the current note', () => {
    const before = newWorkspace(note('existing'));
    const after = addImportedTabs(before, ['first', 'second']);
    const group = focusedGroup(after);
    expect(group.tabs.map(currentPlace)).toEqual([note('existing'), note('first'), note('second')]);
    expect(currentPlace(activeTab(group))).toEqual(note('first'));
    expect(focusedGroup(before).tabs).toHaveLength(1);
  });

  it('opens a large batch without losing tabs to the stack limit', () => {
    const before = stackGroup(newWorkspace(note('existing')));
    const after = addImportedTabs(before, ['a', 'b', 'c', 'd', 'e', 'f']);
    expect(focusedGroup(after).stacked).toBe(false);
    expect(focusedGroup(after).tabs).toHaveLength(focusedGroup(before).tabs.length + 6);
    expect(currentPlace(activeTab(focusedGroup(after)))).toEqual(note('a'));
  });

  it('leaves the workspace alone when no file could be imported', () => {
    const before = newWorkspace(home);
    expect(addImportedTabs(before, [])).toBe(before);
  });
});


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
  it('opens a tab in the background after the active one, keeping several in order', () => {
    let workspace = newWorkspace(note('a'));
    const group = workspace.groups[0];
    const first = newTab(note('b'));
    const second = newTab(note('c'));
    workspace = addBackgroundTab(workspace, group.id, first, group.active);
    workspace = addBackgroundTab(workspace, group.id, second, first.id);
    expect(places(workspace)).toEqual([[note('a'), note('b'), note('c')]]);
    expect(currentPlace(activeTab(workspace.groups[0]))).toEqual(note('a'));
  });

  it('activates the tab beside the closed active tab', () => {
    let workspace = newWorkspace(home);
    const group = workspace.groups[0].id;
    workspace = addTab(addTab(workspace, group, newTab(note('a'))), group, newTab(note('b')));
    const [first, second] = workspace.groups[0].tabs;
    workspace = selectTab(workspace, group, second.id);
    workspace = closeTab(workspace, group, second.id);
    expect(workspace.groups[0].active).toBe(first.id);
  });

  it('leaves one tab on Starjot Home after closing the last one', () => {
    const workspace = newWorkspace(note('a'));
    const group = workspace.groups[0];
    const closed = closeTab(workspace, group.id, group.tabs[0].id);
    expect(places(closed)).toEqual([[{ kind: 'start' }]]);
  });
});

describe('split windows', () => {
  it('splits towards the edge a tab is dropped on, moving the tab into the new group', () => {
    let workspace = newWorkspace(note('a'));
    const b = newTab(note('b'));
    workspace = addTab(workspace, workspace.groups[0].id, b);
    const left = splitWithTab(workspace, workspace.groups[0].id, b.id, 'left');
    expect(places(left)).toEqual([[note('b')], [note('a')]]);
    expect(left.direction).toBe('right');
    expect(left.focus).toBe(left.groups[0].id);
    expect(left.groups[0].tabs[0]).toBe(b);
    const below = splitWithTab(workspace, workspace.groups[0].id, b.id, 'bottom');
    expect(places(below)).toEqual([[note('a')], [note('b')]]);
    expect(below.direction).toBe('down');
  });

  it('keeps the only tab of a group, opening its page again beside it, and splits no further', () => {
    const workspace = newWorkspace(note('a'));
    const split = splitWithTab(workspace, workspace.groups[0].id, workspace.groups[0].tabs[0].id, 'right');
    expect(places(split)).toEqual([[note('a')], [note('a')]]);
    expect(splitWithTab(split, split.groups[0].id, split.groups[0].tabs[0].id, 'left')).toBe(split);
  });

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

  it('leaves the tabs as they are when dropped before a tab that is no longer there', () => {
    let workspace = newWorkspace(note('a'));
    const group = workspace.groups[0].id;
    workspace = addTab(workspace, group, newTab(note('b')));
    const b = workspace.groups[0].tabs[1];
    expect(moveTab(workspace, group, b.id, group, 'closed-meanwhile')).toBe(workspace);
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

  it('keeps a closed tab for later when a full stack has no room to reopen it', () => {
    let workspace = stackGroup(newWorkspace(note('a')));
    for (let count = 0; count < 3; count += 1) workspace = stackGroup(workspace);
    const group = focusedGroup(workspace);
    const closing = group.tabs[1];
    const closed = [{ tab: closing, groupId: group.id, index: 1 }];
    workspace = closeTab(workspace, group.id, closing.id);
    workspace = addTab(workspace, group.id, newTab(note('b')));
    workspace = addTab(workspace, group.id, newTab(note('c')));
    expect(focusedGroup(workspace).tabs).toHaveLength(5);

    const blocked = reopenLastClosed(workspace, closed, () => true);
    expect(blocked).toEqual({ workspace, closed, blocked: true });

    const roomy = closeTab(workspace, group.id, focusedGroup(workspace).tabs[4].id);
    const reopened = reopenLastClosed(roomy, closed, () => true);
    expect(reopened.blocked).toBe(false);
    expect(reopened.closed).toEqual([]);
    expect(focusedGroup(reopened.workspace).tabs.some(tab => tab.id === closing.id)).toBe(true);
  });

  it('skips closed tabs whose notes are all gone, and ones already open again', () => {
    const workspace = newWorkspace(note('a'));
    const open = focusedGroup(workspace).tabs[0];
    const gone = newTab(note('deleted'));
    const result = reopenLastClosed(workspace, [{ tab: open, groupId: 'x', index: 0 }, { tab: gone, groupId: 'x', index: 0 }], place => place.kind !== 'note' || place.id !== 'deleted');
    expect(result).toEqual({ workspace, closed: [], blocked: false });
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


/* =========================
   Reopening Closed Tabs
   ========================= */

describe('reopening closed tabs', () => {
  it('brings a closed tab back where it was, with its history, and makes it active', () => {
    let workspace = newWorkspace(home);
    const group = workspace.groups[0].id;
    const middle = goTo(newTab(note('a')), note('b'));
    workspace = addTab(addTab(workspace, group, middle), group, newTab(note('c')));
    workspace = closeTab(workspace, group, middle.id);

    const reopened = reopenTab(workspace, { tab: middle, groupId: group, index: 1 });
    const tabs = reopened.groups[0].tabs;
    expect(tabs.map(tab => tab.id)[1]).toBe(middle.id);
    expect(activeTab(reopened.groups[0]).id).toBe(middle.id);
    expect(currentPlace(tabs[1])).toEqual(note('b'));
    expect(stepPlace(tabs[1], -1, everything)).toEqual(note('a'));
  });

  it('uses the focused group when its own group has closed, and never adds a tab twice', () => {
    const workspace = newWorkspace(home);
    const tab = newTab(note('a'));
    const reopened = reopenTab(workspace, { tab, groupId: 'gone', index: 5 });
    expect(reopened.groups[0].tabs.map(item => item.id)).toEqual([workspace.groups[0].tabs[0].id, tab.id]);
    expect(reopenTab(reopened, { tab, groupId: 'gone', index: 0 })).toBe(reopened);
  });
});


/* =========================
   Switching Tabs
   ========================= */

describe('switching tabs with Ctrl + Tab', () => {
  it('goes to the next or previous tab, wrapping around at the ends', () => {
    let workspace = newWorkspace(home);
    const group = workspace.groups[0].id;
    const [first] = workspace.groups[0].tabs;
    const second = newTab(note('a'));
    workspace = addTab(workspace, group, second);
    expect(activeTab(workspace.groups[0]).id).toBe(second.id);
    expect(activeTab(cycleTab(workspace, 1).groups[0]).id).toBe(first.id);
    expect(activeTab(cycleTab(workspace, -1).groups[0]).id).toBe(first.id);
    expect(activeTab(cycleTab(cycleTab(workspace, 1), 1).groups[0]).id).toBe(second.id);
  });

  it('changes nothing with one tab', () => {
    const workspace = newWorkspace(home);
    expect(cycleTab(workspace, 1)).toBe(workspace);
  });
});


/* =========================
   Saved Layout
   ========================= */

describe('restoring the saved layout', () => {
  const exists = (place: Place) => place.kind !== 'note' || place.id !== 'deleted';
  const roundTrip = (workspace: Workspace) => JSON.parse(JSON.stringify(workspace));

  it('brings back groups, tabs, histories, the active tabs and the focus as they were', () => {
    let workspace = splitWorkspace(newWorkspace(note('a')), 'down');
    const right = workspace.groups[1].id;
    workspace = addTab(workspace, right, newTab(note('b')));
    workspace = updateTab(workspace, right, goTo(focusedGroup(workspace).tabs[1], note('c')));
    expect(restoreWorkspace(roundTrip(workspace), exists)).toEqual(workspace);
  });

  it('drops pages that are gone, and tabs with nothing left, choosing another active tab', () => {
    let workspace = newWorkspace(note('a'));
    const group = workspace.groups[0].id;
    const gone = newTab(note('deleted'));
    workspace = addTab(workspace, group, gone);
    workspace = updateTab(workspace, group, goTo(activeTab(workspace.groups[0]), note('deleted')));
    const restored = restoreWorkspace(roundTrip(workspace), exists) as Workspace;
    expect(places(restored)).toEqual([[note('a')]]);
    expect(restored.groups[0].active).toBe(restored.groups[0].tabs[0].id);
  });

  it('gives up on anything that is not a layout, so the app opens fresh', () => {
    expect(restoreWorkspace(null, exists)).toBeNull();
    expect(restoreWorkspace({ groups: 'no' }, exists)).toBeNull();
    expect(restoreWorkspace({ groups: [{ id: 'g', tabs: [{ id: 't', history: [{ kind: 'note', id: 'deleted' }], index: 0 }] }] }, exists)).toBeNull();
  });

  it('numbers new tabs after the restored ones, so ids never repeat', () => {
    const saved = { groups: [{ id: 'group900', tabs: [{ id: 'tab950', history: [home], index: 0 }], active: 'tab950' }], focus: 'group900' };
    continueIdsAfter(restoreWorkspace(saved, exists) as Workspace);
    expect(Number(newTab(home).id.replace('tab', ''))).toBeGreaterThan(950);
  });
});
