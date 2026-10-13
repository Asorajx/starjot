/* =========================
   Notespace Tabs
   ========================= */

/* A place a tab can show: Starjot Home, the notes home, one category's page, or one note. */
/* 'start' is Starjot Home, the app's own home; 'home' is the Notespace home. */
export type Place = { kind: 'start' } | { kind: 'home' } | { kind: 'category'; id: string } | { kind: 'note'; id: string };

/* A tab keeps its own history, like a browser tab: the places it has shown, and which one it shows now. */
export type NoteTab = { id: string; history: Place[]; index: number };

/* A tab group has its own strip of tabs and shows its active tab. A stacked group shows its tabs */
/* side by side instead, like cards: two are open, and the others fold into narrow strips with their */
/* titles. stackStart is the first of the two open tabs. */
export type TabGroup = { id: string; tabs: NoteTab[]; active: string; stacked: boolean; stackStart: number };

/* The tab groups in the window: one, or two after a split (side by side or one above the other). */
/* focus is the group last worked in; the window title and keyboard shortcuts follow it. */
export type Workspace = { groups: TabGroup[]; direction: 'right' | 'down'; focus: string };

/* Back and forward can go this many places back at most. */
const HISTORY_LIMIT = 50;

/* A tab that was closed, remembered so Ctrl + Shift + T can bring it back where it was. */
export type ClosedTab = { tab: NoteTab; groupId: string; index: number };

/* A window holds at most this many tab groups. */
const GROUP_LIMIT = 2;

/* A stacked group holds at most this many tabs. */
export const STACK_LIMIT = 5;

let idCount = 0;

function nextId(prefix: string) {
  idCount += 1;
  return `${prefix}${idCount}`;
}


/* =========================
   Tab History
   ========================= */

export function newTab(place: Place): NoteTab {
  return { id: nextId('tab'), history: [place], index: 0 };
}

export function currentPlace(tab: NoteTab) {
  return tab.history[tab.index];
}

export function samePlace(a: Place, b: Place) {
  return a.kind === b.kind && ('id' in a ? a.id : '') === ('id' in b ? b.id : '');
}

/* Going somewhere new drops any places ahead of the current one, like following a link in a browser */
/* after pressing Back. Going to the place already shown changes nothing. */
export function goTo(tab: NoteTab, place: Place): NoteTab {
  if (samePlace(currentPlace(tab), place)) return tab;
  const history = [...tab.history.slice(0, tab.index + 1), place].slice(-HISTORY_LIMIT);
  return { ...tab, history, index: history.length - 1 };
}

/* One step back (-1) or forward (1), skipping places that no longer exist, such as a deleted note. */
/* Returns null when there is nowhere to go. */
export function step(tab: NoteTab, direction: -1 | 1, exists: (place: Place) => boolean): NoteTab | null {
  let index = tab.index + direction;
  while (tab.history[index] && !exists(tab.history[index])) index += direction;
  return tab.history[index] ? { ...tab, index } : null;
}

/* The place one step back or forward, for button tooltips such as "Back to Project Atlas". */
export function stepPlace(tab: NoteTab, direction: -1 | 1, exists: (place: Place) => boolean) {
  const next = step(tab, direction, exists);
  return next ? currentPlace(next) : null;
}


/* =========================
   Tab Groups
   ========================= */

function newGroup(tabs: NoteTab[], active = tabs[0].id): TabGroup {
  return { id: nextId('group'), tabs, active, stacked: false, stackStart: 0 };
}

export function newWorkspace(place: Place): Workspace {
  const group = newGroup([newTab(place)]);
  return { groups: [group], direction: 'right', focus: group.id };
}

export function activeTab(group: TabGroup) {
  return group.tabs.find(tab => tab.id === group.active) ?? group.tabs[0];
}

export function focusedGroup(workspace: Workspace) {
  return workspace.groups.find(group => group.id === workspace.focus) ?? workspace.groups[0];
}

function changeGroup(workspace: Workspace, id: string, change: (group: TabGroup) => TabGroup): Workspace {
  return { ...workspace, groups: workspace.groups.map(group => (group.id === id ? change(group) : group)) };
}

/* The first of the two open tabs of a stack, kept between the first and the second-to-last. */
function clampStart(group: TabGroup, start: number) {
  return Math.max(0, Math.min(start, group.tabs.length - 2));
}

/* In a stack, opening a folded tab shows it beside the open tab on the side the view moves from, so */
/* the stack slides along like a row of cards. Opening an open tab keeps both where they are. */
function withActive(group: TabGroup, id: string): TabGroup {
  const index = group.tabs.findIndex(tab => tab.id === id);
  if (index < 0) return group;
  let { stackStart } = group;
  if (group.stacked && (index < stackStart || index > stackStart + 1)) stackStart = clampStart(group, index > stackStart ? index - 1 : index);
  return { ...group, active: id, stackStart };
}

/* The tabs of a stacked group that are open; the others are folded. */
export function isOpenInStack(group: TabGroup, index: number) {
  return group.tabs.length < 2 || index === group.stackStart || index === group.stackStart + 1;
}

export function canAddTab(group: TabGroup) {
  return !group.stacked || group.tabs.length < STACK_LIMIT;
}

export function updateTab(workspace: Workspace, groupId: string, tab: NoteTab): Workspace {
  return changeGroup(workspace, groupId, group => ({ ...group, tabs: group.tabs.map(item => (item.id === tab.id ? tab : item)) }));
}

/* Make a tab active in its group and that group the focused one. */
export function selectTab(workspace: Workspace, groupId: string, tabId: string): Workspace {
  return { ...changeGroup(workspace, groupId, group => withActive(group, tabId)), focus: groupId };
}

/* The next (1) or previous (-1) tab of the focused group becomes active, wrapping around at the */
/* ends, as Ctrl + Tab does in a browser. */
export function cycleTab(workspace: Workspace, direction: -1 | 1): Workspace {
  const group = focusedGroup(workspace);
  if (group.tabs.length < 2) return workspace;
  const index = group.tabs.indexOf(activeTab(group));
  const next = group.tabs[(index + direction + group.tabs.length) % group.tabs.length];
  return selectTab(workspace, group.id, next.id);
}

export function focusGroup(workspace: Workspace, groupId: string): Workspace {
  return workspace.focus === groupId || !workspace.groups.some(group => group.id === groupId) ? workspace : { ...workspace, focus: groupId };
}

/* Add a tab to a group, after its active tab or at the end, and make it active. A full stack */
/* takes no more tabs. */
export function addTab(workspace: Workspace, groupId: string, tab: NoteTab, afterActive = false): Workspace {
  const group = workspace.groups.find(item => item.id === groupId);
  if (!group || !canAddTab(group)) return workspace;
  const index = afterActive ? group.tabs.indexOf(activeTab(group)) + 1 : group.tabs.length;
  const tabs = [...group.tabs.slice(0, index), tab, ...group.tabs.slice(index)];
  return selectTab(changeGroup(workspace, groupId, () => ({ ...group, tabs })), groupId, tab.id);
}

/* Close a tab. The tab beside it becomes active if the closed one was. A group left without tabs */
/* closes too, unless it is the only one, which then shows Starjot Home. A stack with one tab */
/* left becomes a normal group. */
export function closeTab(workspace: Workspace, groupId: string, tabId: string): Workspace {
  const group = workspace.groups.find(item => item.id === groupId);
  if (!group) return workspace;
  const index = group.tabs.findIndex(tab => tab.id === tabId);
  const tabs = group.tabs.filter(tab => tab.id !== tabId);

  if (!tabs.length) {
    const rest = workspace.groups.filter(item => item.id !== groupId);
    if (rest.length) return { ...workspace, groups: rest, focus: rest.some(item => item.id === workspace.focus) ? workspace.focus : rest[0].id };
    const fresh = newTab({ kind: 'start' });
    return changeGroup(workspace, groupId, () => ({ ...group, tabs: [fresh], active: fresh.id, stacked: false, stackStart: 0 }));
  }

  const active = group.active === tabId ? tabs[Math.max(0, index - 1)].id : group.active;
  const shrunk: TabGroup = {
    ...group,
    tabs,
    stacked: group.stacked && tabs.length > 1,
    stackStart: clampStart({ ...group, tabs }, group.stackStart > index ? group.stackStart - 1 : group.stackStart)
  };
  return changeGroup(workspace, groupId, () => withActive({ ...shrunk, active: '' }, active));
}

/* Bring back a closed tab, with its history, at its old place in its group (or in the focused */
/* group, when its own has closed since or is a full stack), and make it active. */
export function reopenTab(workspace: Workspace, closed: ClosedTab): Workspace {
  const group = workspace.groups.find(item => item.id === closed.groupId && canAddTab(item)) ?? focusedGroup(workspace);
  if (!canAddTab(group) || group.tabs.some(tab => tab.id === closed.tab.id)) return workspace;
  const index = Math.min(closed.index, group.tabs.length);
  const tabs = [...group.tabs.slice(0, index), closed.tab, ...group.tabs.slice(index)];
  return selectTab(changeGroup(workspace, group.id, () => ({ ...group, tabs })), group.id, closed.tab.id);
}


/* Move a tab (dragged by its tab or strip) into a group, before another tab or at the end. Moving */
/* a group's last tab out closes that group, so dragging the tabs of a split window into one group */
/* unsplits it. A full stack takes no more tabs, and a stack left with one tab becomes a normal group. */
export function moveTab(workspace: Workspace, fromId: string, tabId: string, toId: string, beforeId: string | null = null): Workspace {
  const from = workspace.groups.find(group => group.id === fromId);
  const to = workspace.groups.find(group => group.id === toId);
  const tab = from?.tabs.find(item => item.id === tabId);
  if (!from || !to || !tab || tabId === beforeId || (from !== to && !canAddTab(to))) return workspace;

  const rest = from.tabs.filter(item => item.id !== tabId);
  let groups = workspace.groups;
  if (from !== to && !rest.length) {
    groups = groups.filter(group => group.id !== fromId);
  } else if (from !== to) {
    const shrunk = { ...from, tabs: rest, stacked: from.stacked && rest.length > 1 };
    const left = withActive({ ...shrunk, stackStart: clampStart(shrunk, from.stackStart) }, from.active === tabId ? rest[0].id : from.active);
    groups = groups.map(group => (group.id === fromId ? left : group));
  }

  const target = groups.find(group => group.id === toId) as TabGroup;
  const others = target.tabs.filter(item => item.id !== tabId);
  const index = beforeId ? Math.max(0, others.findIndex(item => item.id === beforeId)) : others.length;
  const tabs = [...others.slice(0, index), tab, ...others.slice(index)];
  return selectTab({ ...workspace, groups: groups.map(group => (group.id === toId ? { ...target, tabs } : group)) }, toId, tabId);
}


/* =========================
   Split, Stack and Unsplit
   ========================= */

export function isSplit(workspace: Workspace) {
  return workspace.groups.length > 1;
}

/* Split the window: a new tab group beside or below the focused one, showing the same place, */
/* takes the focus. A split window only changes direction. */
export function splitWorkspace(workspace: Workspace, direction: 'right' | 'down'): Workspace {
  if (workspace.groups.length >= GROUP_LIMIT) return { ...workspace, direction };
  const from = focusedGroup(workspace);
  const group = newGroup([newTab(currentPlace(activeTab(from)))]);
  const index = workspace.groups.indexOf(from) + 1;
  return { groups: [...workspace.groups.slice(0, index), group, ...workspace.groups.slice(index)], direction, focus: group.id };
}

/* Stack the focused group's tabs, adding a tab with the same place after the active one, so two */
/* pages show side by side. A stacked group keeps adding tabs this way, up to STACK_LIMIT. */
export function canStack(group: TabGroup) {
  return group.tabs.length < STACK_LIMIT;
}

export function stackGroup(workspace: Workspace): Workspace {
  const group = focusedGroup(workspace);
  if (!canStack(group)) return workspace;
  const stacked = changeGroup(workspace, group.id, item => ({ ...item, stacked: true, stackStart: item.tabs.indexOf(activeTab(item)) }));
  return addTab(stacked, group.id, newTab(currentPlace(activeTab(group))), true);
}

/* Put every tab back into one normal tab strip, in order, keeping each tab's history. The focused */
/* tab stays active. */
export function unsplit(workspace: Workspace): Workspace {
  const focused = focusedGroup(workspace);
  const group = newGroup(workspace.groups.flatMap(item => item.tabs), activeTab(focused).id);
  return { groups: [{ ...group, id: workspace.groups[0].id }], direction: workspace.direction, focus: workspace.groups[0].id };
}
