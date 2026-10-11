/* =========================
   Notespace Tabs
   ========================= */

/* A place a tab can show: the notes home, one category's page, or one note. */
export type Place = { kind: 'home' } | { kind: 'category'; id: string } | { kind: 'note'; id: string };

/* A tab keeps its own history, like a browser tab: the places it has shown, and which one it shows now. */
export type NoteTab = { id: string; history: Place[]; index: number };

/* Back and forward can go this many places back at most. */
const HISTORY_LIMIT = 50;

let tabCount = 0;

export function newTab(place: Place): NoteTab {
  tabCount += 1;
  return { id: `tab${tabCount}`, history: [place], index: 0 };
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

/* Close a tab. The tab beside it becomes active if the closed one was; closing the last tab leaves */
/* one new tab showing the notes home. */
export function closeTab(tabs: NoteTab[], activeId: string, id: string) {
  const index = tabs.findIndex(tab => tab.id === id);
  const rest = tabs.filter(tab => tab.id !== id);
  if (!rest.length) {
    const fresh = newTab({ kind: 'home' });
    return { tabs: [fresh], active: fresh.id };
  }
  const active = activeId === id ? rest[Math.max(0, index - 1)].id : activeId;
  return { tabs: rest, active };
}
