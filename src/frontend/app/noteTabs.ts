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


/* =========================
   Saved Layout
   ========================= */

function readPlace(raw: unknown): Place | null {
  const record = raw as { kind?: unknown; id?: unknown } | null;
  if (!record || typeof record !== 'object') return null;
  if (record.kind === 'start' || record.kind === 'home') return { kind: record.kind };
  if ((record.kind === 'note' || record.kind === 'category') && typeof record.id === 'string' && record.id) return { kind: record.kind, id: record.id };
  return null;
}

/* A tab from a saved layout: its history keeps the places that still exist (a deleted note's */
/* entry drops out), showing the same place as before or the nearest one left. Null when nothing */
/* it showed is left. */
function readTab(raw: unknown, exists: (place: Place) => boolean): NoteTab | null {
  const record = raw as { id?: unknown; history?: unknown; index?: unknown } | null;
  if (!record || typeof record.id !== 'string' || !Array.isArray(record.history)) return null;
  const shown = Number.isInteger(record.index) ? Number(record.index) : record.history.length - 1;
  const kept: Place[] = [];
  let index = -1;
  record.history.slice(0, HISTORY_LIMIT).forEach((entry, at) => {
    const place = readPlace(entry);
    if (!place || !exists(place)) return;
    kept.push(place);
    if (at <= shown) index = kept.length - 1;
  });
  if (!kept.length) return null;
  return { id: record.id, history: kept, index: Math.max(0, index) };
}

/* The layout saved last time, checked: tabs whose pages are all gone are left out, as are */
/* groups left empty, and the active tabs and focus fall back to ones that remain. Null when */
/* nothing usable is left, so the app opens as on a first visit. */
export function restoreWorkspace(raw: unknown, exists: (place: Place) => boolean): Workspace | null {
  const record = raw as { groups?: unknown; direction?: unknown; focus?: unknown } | null;
  if (!record || !Array.isArray(record.groups)) return null;
  const seen = new Set<string>();
  const groups: TabGroup[] = [];
  for (const rawGroup of record.groups.slice(0, GROUP_LIMIT)) {
    const group = rawGroup as { id?: unknown; tabs?: unknown; active?: unknown; stacked?: unknown; stackStart?: unknown } | null;
    if (!group || typeof group.id !== 'string' || seen.has(group.id) || !Array.isArray(group.tabs)) continue;
    const tabs = group.tabs
      .map(tab => readTab(tab, exists))
      .filter((tab): tab is NoteTab => tab !== null && !seen.has(tab.id) && Boolean(seen.add(tab.id)))
      .slice(0, group.stacked === true ? STACK_LIMIT : undefined);
    if (!tabs.length) continue;
    seen.add(group.id);
    const stacked = group.stacked === true && tabs.length > 1;
    const active = tabs.some(tab => tab.id === group.active) ? String(group.active) : tabs[0].id;
    const restored: TabGroup = { id: group.id, tabs, active, stacked, stackStart: 0 };
    groups.push(withActive({ ...restored, stackStart: clampStart(restored, Number(group.stackStart) || 0) }, active));
  }
  if (!groups.length) return null;
  const focus = groups.some(group => group.id === record.focus) ? String(record.focus) : groups[0].id;
  return { groups, direction: record.direction === 'down' ? 'down' : 'right', focus };
}

/* New tabs and groups are numbered after the restored ones, so no two ever share an id. */
export function continueIdsAfter(workspace: Workspace) {
  const numbers = workspace.groups.flatMap(group => [group.id, ...group.tabs.map(tab => tab.id)])
    .map(id => Number(id.match(/(\d+)$/)?.[1] ?? 0));
  idCount = Math.max(idCount, ...numbers);
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

/* Add a tab without showing it (a note opened in the background), after the tab afterId (or */
/* the active tab when it is gone), so several opened in a row keep their order, as in a browser. */
export function addBackgroundTab(workspace: Workspace, groupId: string, tab: NoteTab, afterId: string): Workspace {
  const group = workspace.groups.find(item => item.id === groupId);
  if (!group || !canAddTab(group)) return workspace;
  const after = group.tabs.findIndex(item => item.id === afterId);
  const index = (after >= 0 ? after : group.tabs.indexOf(activeTab(group))) + 1;
  return changeGroup(workspace, groupId, () => ({ ...group, tabs: [...group.tabs.slice(0, index), tab, ...group.tabs.slice(index)] }));
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


/* Reopen the most recently closed tab. One showing a note deleted since steps back (or on) to a */
/* place that still exists; one with nothing left, or already open again, is skipped. A closed */
/* tab is only taken off the list once it is open: with no room for it (a full stack) it stays, */
/* and `blocked` says so. */
export function reopenLastClosed(workspace: Workspace, closed: ClosedTab[], exists: (place: Place) => boolean) {
  let remaining = closed;
  while (remaining.length) {
    const last = remaining[remaining.length - 1];
    const tab = exists(currentPlace(last.tab)) ? last.tab : step(last.tab, -1, exists) ?? step(last.tab, 1, exists);
    const alreadyOpen = workspace.groups.some(group => group.tabs.some(open => open.id === last.tab.id));
    const next = tab && !alreadyOpen ? reopenTab(workspace, { ...last, tab }) : workspace;
    if (tab && !alreadyOpen && next === workspace) return { workspace, closed: remaining, blocked: true };
    remaining = remaining.slice(0, -1);
    if (next !== workspace) return { workspace: next, closed: remaining, blocked: false };
  }
  return { workspace, closed: remaining, blocked: false };
}

/* Move a tab (dragged by its tab or strip) into a group, before another tab or at the end. Moving */
/* a group's last tab out closes that group, so dragging the tabs of a split window into one group */
/* unsplits it. A full stack takes no more tabs, and a stack left with one tab becomes a normal group. */
/* A drop before a tab that is no longer in the group (it closed during the drag) changes nothing. */
export function moveTab(workspace: Workspace, fromId: string, tabId: string, toId: string, beforeId: string | null = null): Workspace {
  const from = workspace.groups.find(group => group.id === fromId);
  const to = workspace.groups.find(group => group.id === toId);
  const tab = from?.tabs.find(item => item.id === tabId);
  if (!from || !to || !tab || tabId === beforeId || (from !== to && !canAddTab(to))) return workspace;
  if (beforeId && !to.tabs.some(item => item.id === beforeId)) return workspace;

  let groups = workspace.groups;
  if (from !== to && from.tabs.length < 2) {
    groups = groups.filter(group => group.id !== fromId);
  } else if (from !== to) {
    groups = groups.map(group => (group.id === fromId ? withoutTab(from, tabId) : group));
  }

  const target = groups.find(group => group.id === toId) as TabGroup;
  const others = target.tabs.filter(item => item.id !== tabId);
  const index = beforeId ? others.findIndex(item => item.id === beforeId) : others.length;
  const tabs = [...others.slice(0, index), tab, ...others.slice(index)];
  return selectTab({ ...workspace, groups: groups.map(group => (group.id === toId ? { ...target, tabs } : group)) }, toId, tabId);
}


/* A group after one of its tabs (not its last) moves out: the first tab becomes active if the */
/* moved one was, and a stack of one becomes a normal group. */
function withoutTab(group: TabGroup, tabId: string) {
  const rest = group.tabs.filter(item => item.id !== tabId);
  const shrunk = { ...group, tabs: rest, stacked: group.stacked && rest.length > 1 };
  return withActive({ ...shrunk, stackStart: clampStart(shrunk, group.stackStart) }, group.active === tabId ? rest[0].id : group.active);
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

export type SplitSide = 'left' | 'right' | 'top' | 'bottom';

export function canSplit(workspace: Workspace) {
  return workspace.groups.length < GROUP_LIMIT;
}

/* A tab dropped on an edge of a page splits the window there: the tab moves into a new group on */
/* that side, which takes the focus. A group's only tab stays, and a new tab with its page opens */
/* beside it instead (as Split right does). */
export function splitWithTab(workspace: Workspace, fromId: string, tabId: string, side: SplitSide): Workspace {
  const from = workspace.groups.find(group => group.id === fromId);
  const tab = from?.tabs.find(item => item.id === tabId);
  if (!canSplit(workspace) || !from || !tab) return workspace;
  const moving = from.tabs.length > 1;
  const group = newGroup([moving ? tab : newTab(currentPlace(tab))]);
  const groups = workspace.groups.map(item => (item.id === fromId && moving ? withoutTab(from, tabId) : item));
  const index = groups.findIndex(item => item.id === fromId) + (side === 'left' || side === 'top' ? 0 : 1);
  return {
    groups: [...groups.slice(0, index), group, ...groups.slice(index)],
    direction: side === 'left' || side === 'right' ? 'right' : 'down',
    focus: group.id
  };
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
