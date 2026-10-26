import { useSyncExternalStore } from 'react';
import { markBoardDamaged, onBoardSavedElsewhere, readBoard, writeBoard } from '../../backend/storage/boardStorage';
import { showToast } from '../lib/toasts';
import type { BoardProject, Sprint, WorkItem, WorkStatus, WorkType } from '../../shared/types/board';
import { parseDay } from './dates';
import { BAR_COLORS, OLD_BAR_COLORS, canHoldWork, familyOf, itemOrder, shownSprintOf, sprintOrder, WORK_STATUSES, WORK_TYPES } from './workItems';


/* =========================
   Checking Saved Projects
   ========================= */

/* Limits. A team takes up to MAX_MEMBERS when adding one, but a saved project is loaded whole: */
/* dropping sprints, work items or members past a count would lose them for good at the next save. */
const MAX_MEMBERS = 200;
const MAX_NOTE_LINKS = 50;
export const NAME_LENGTH = 140;
export const TITLE_LENGTH = 70;
export const MEMBER_LENGTH = 80;

export function blankProject(): BoardProject {
  return { version: 5, title: 'Untitled project', members: [], sprints: [], items: [], collapsedSprints: {}, collapsedItems: {}, collapsedCards: {} };
}

export function newId(kind: 's' | 'i') {
  return `${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

const text = (value: unknown, max = NAME_LENGTH) => String(value ?? '').trim().slice(0, max);
const isColor = (value: unknown) => /^#[0-9a-f]{6}$/i.test(String(value ?? ''));
const orderOf = (value: unknown, fallback: number) => (Number.isFinite(Number(value)) && value !== '' && value !== null ? Number(value) : fallback);

/* Turn saved or imported data into a valid project: anything broken is repaired or left out. */
/* Throws when the data is not a project at all. */
export function cleanProject(raw: unknown): BoardProject {
  const record = raw as Record<string, unknown> | null;
  if (!record || typeof record !== 'object' || !Array.isArray(record.items) || !Array.isArray(record.sprints)) {
    throw new Error('This does not look like a Boardspace project backup.');
  }
  const project = blankProject();
  project.title = text(record.title, TITLE_LENGTH) || 'Untitled project';

  const sprintIds = new Set<string>();
  (record.sprints as Record<string, unknown>[]).forEach((sprint, index) => {
    const start = String(sprint?.start ?? '');
    const end = String(sprint?.end ?? '');
    if (!sprint || !text(sprint.name) || !parseDay(start) || !parseDay(end) || start > end) return;
    const id = text(sprint.id, 100) || newId('s');
    if (sprintIds.has(id)) return;
    sprintIds.add(id);
    project.sprints.push({ id, name: text(sprint.name), start, end, order: orderOf(sprint.order, index) });
  });

  const itemIds = new Set<string>();
  (record.items as Record<string, unknown>[]).forEach((item, index) => {
    const start = String(item?.start ?? '');
    const end = String(item?.end ?? '');
    if (!item || !text(item.name) || !parseDay(start) || !parseDay(end) || start > end) return;
    const id = text(item.id, 100) || newId('i');
    if (itemIds.has(id)) return;
    itemIds.add(id);
    project.items.push({
      id,
      name: text(item.name),
      type: (item.type as WorkType) in WORK_TYPES ? item.type as WorkType : 'task',
      parentId: text(item.parentId, 100),
      sprintId: sprintIds.has(String(item.sprintId)) ? String(item.sprintId) : '',
      status: (item.status as WorkStatus) in WORK_STATUSES ? item.status as WorkStatus : 'todo',
      assignee: text(item.assignee, MEMBER_LENGTH),
      start,
      end,
      color: isColor(item.color) ? OLD_BAR_COLORS[String(item.color).toLowerCase()] ?? String(item.color).toLowerCase() : BAR_COLORS[0],
      progress: Math.max(0, Math.min(100, Number(item.progress) || 0)),
      manualBacklog: item.manualBacklog === true,
      order: orderOf(item.order, index),
      notes: noteLinks(item.notes)
    });
  });

  /* Members are kept once each, including names only found on work items. */
  const seen = new Set<string>();
  project.members = [...(Array.isArray(record.members) ? record.members : []), ...project.items.map(item => item.assignee)]
    .map(name => text(name, MEMBER_LENGTH))
    .filter(name => {
      const key = name.toLocaleLowerCase();
      if (!name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  /* A parent that is missing, of the wrong kind, or inside the item itself is dropped. */
  const byId = new Map(project.items.map(item => [item.id, item]));
  for (const item of project.items) {
    const parent = byId.get(item.parentId);
    if (!parent || parent.id === item.id || !canHoldWork(parent.type, item.type)) item.parentId = '';
    const visited = new Set([item.id]);
    let above = byId.get(item.parentId);
    while (above) {
      if (visited.has(above.id)) {
        item.parentId = '';
        break;
      }
      visited.add(above.id);
      above = byId.get(above.parentId);
    }
  }

  for (const key of ['collapsedSprints', 'collapsedItems', 'collapsedCards'] as const) {
    const folded = record[key];
    if (folded && typeof folded === 'object') {
      Object.entries(folded as Record<string, unknown>).forEach(([id, value]) => {
        if (value === true) project[key][id] = true;
      });
    }
  }
  return project;
}

/* A saved project that is not a project at all is kept aside (it is never saved over). */
function load() {
  try {
    const saved = readBoard();
    return saved ? cleanProject(saved) : blankProject();
  } catch {
    markBoardDamaged();
    return blankProject();
  }
}


/* =========================
   The Project
   ========================= */

let project: BoardProject = load();
const listeners = new Set<() => void>();
let warned = false;

/* Every change makes a new project object, so React redraws, and is saved straight away. */
function change(update: (draft: BoardProject) => void) {
  const draft: BoardProject = structuredClone(project);
  update(draft);
  project = draft;
  if (!writeBoard(project) && !warned) {
    warned = true;
    showToast({ kind: 'error', title: 'Could not save Boardspace', description: 'Export a project backup to keep your work.' });
  }
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/* Another tab or window of Starjot saved the project (every change here is saved at once, so */
/* there is nothing waiting): show its version, so this tab never saves an older one over it. */
onBoardSavedElsewhere(() => {
  try {
    const saved = readBoard();
    if (!saved) return;
    project = cleanProject(saved);
    listeners.forEach(listener => listener());
  } catch {
    /* Not a project: leave this tab as it is. */
  }
});

export function getBoard() {
  return project;
}

export function useBoard() {
  return useSyncExternalStore(subscribe, getBoard);
}

/* Replace the whole project (an import). */
export function replaceBoard(next: BoardProject) {
  change(draft => Object.assign(draft, cleanProject(next)));
}

export function setBoardTitle(title: string) {
  change(draft => { draft.title = text(title, TITLE_LENGTH) || 'Untitled project'; });
}


/* =========================
   Sprints
   ========================= */

export type SprintFields = Pick<Sprint, 'name' | 'start' | 'end'>;

/* Add a sprint (at the end), or change one. */
export function saveSprint(fields: SprintFields, id = '') {
  change(draft => {
    const sprint = draft.sprints.find(item => item.id === id);
    const clean = { name: text(fields.name), start: fields.start, end: fields.end };
    if (sprint) Object.assign(sprint, clean);
    else draft.sprints.push({ id: newId('s'), ...clean, order: draft.sprints.length });
  });
}

/* A deleted sprint's work moves to the backlog. */
export function deleteSprint(id: string) {
  change(draft => {
    draft.sprints = draft.sprints.filter(sprint => sprint.id !== id);
    draft.items.forEach(item => {
      if (item.sprintId === id) item.sprintId = '';
    });
    delete draft.collapsedSprints[id];
  });
}

/* Move a sprint to where another one is (dates stay as they are). */
export function moveSprint(id: string, ontoId: string) {
  change(draft => {
    const sorted = [...draft.sprints].sort(sprintOrder);
    const from = sorted.findIndex(sprint => sprint.id === id);
    const to = sorted.findIndex(sprint => sprint.id === ontoId);
    if (from < 0 || to < 0) return;
    const [moving] = sorted.splice(from, 1);
    sorted.splice(to, 0, moving);
    sorted.forEach((sprint, index) => { sprint.order = index; });
  });
}

export function toggleSprintFolded(id: string) {
  change(draft => {
    if (draft.collapsedSprints[id]) delete draft.collapsedSprints[id];
    else draft.collapsedSprints[id] = true;
  });
}


/* =========================
   Work Items
   ========================= */

export type ItemFields = Pick<WorkItem, 'name' | 'type' | 'parentId' | 'sprintId' | 'status' | 'assignee' | 'start' | 'end' | 'color' | 'progress'>;

/* Add a work item (at the end of its sprint), or change one. An epic's status and progress */
/* come from its tasks; a done task is 100% along. Moving an item to another sprint takes the */
/* work inside it that was in the same sprint along; children that can no longer sit inside it */
/* (after its kind changed) become top-level. Returns the item's id. */
export function saveItem(fields: ItemFields, id = '') {
  const itemId = id || newId('i');
  change(draft => {
    const isEpic = fields.type === 'epic';
    const clean = {
      ...fields,
      name: text(fields.name),
      assignee: text(fields.assignee, MEMBER_LENGTH),
      color: isColor(fields.color) ? fields.color : BAR_COLORS[0],
      status: isEpic ? 'todo' as const : fields.status,
      progress: isEpic ? 0 : fields.status === 'done' ? 100 : Math.max(0, Math.min(100, fields.progress)),
      manualBacklog: isEpic && !fields.sprintId
    };
    const item = draft.items.find(entry => entry.id === id);
    if (!item) {
      draft.items.push({ id: itemId, ...clean, order: draft.items.length });
      return;
    }
    const oldSprint = item.sprintId;
    Object.assign(item, clean);
    if (oldSprint !== clean.sprintId) {
      const family = familyOf(draft.items, item.id);
      draft.items.forEach(entry => {
        if (family.has(entry.id) && entry.id !== item.id && entry.sprintId === oldSprint) entry.sprintId = clean.sprintId;
      });
    }
    draft.items.forEach(child => {
      if (child.parentId === item.id && !canHoldWork(item.type, child.type)) child.parentId = '';
    });
  });
  return itemId;
}

/* Delete an item and everything inside it. */
export function deleteItem(id: string) {
  change(draft => {
    const family = familyOf(draft.items, id);
    draft.items = draft.items.filter(item => !family.has(item.id));
    family.forEach(member => {
      delete draft.collapsedItems[member];
      delete draft.collapsedCards[member];
    });
  });
}

/* Changing a status to Done makes the work 100% along; changing it back from Done resets that. */
export function setStatus(id: string, status: WorkStatus) {
  change(draft => {
    const item = draft.items.find(entry => entry.id === id);
    if (!item || item.type === 'epic') return;
    const wasDone = item.status === 'done';
    item.status = status;
    if (status === 'done') item.progress = 100;
    else if (wasDone && item.progress === 100) item.progress = 0;
  });
}

/* Linked note ids, each once, from saved or imported data. */
function noteLinks(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map(id => text(id, 100)).filter(Boolean))].slice(0, MAX_NOTE_LINKS);
}

/* Link a note to a work item, or unlink it. Links change at once, like status and assignee. */
export function linkNote(id: string, noteId: string) {
  change(draft => {
    const item = draft.items.find(entry => entry.id === id);
    if (item && !item.notes?.includes(noteId)) item.notes = noteLinks([...(item.notes ?? []), noteId]);
  });
}

export function unlinkNote(id: string, noteId: string) {
  change(draft => {
    const item = draft.items.find(entry => entry.id === id);
    if (item) item.notes = (item.notes ?? []).filter(entry => entry !== noteId);
  });
}

export function setAssignee(id: string, name: string) {
  change(draft => {
    const item = draft.items.find(entry => entry.id === id);
    if (item) item.assignee = text(name, MEMBER_LENGTH);
  });
}

export function setDates(id: string, start: string, end: string) {
  change(draft => {
    const item = draft.items.find(entry => entry.id === id);
    if (item && parseDay(start) && parseDay(end) && start <= end) Object.assign(item, { start, end });
  });
}

export function toggleItemFolded(id: string) {
  change(draft => {
    if (draft.collapsedItems[id]) delete draft.collapsedItems[id];
    else draft.collapsedItems[id] = true;
  });
}

/* Collapse Board cards to their name only, or expand them again (one card, or all shown). */
export function setCardsCollapsed(ids: string[], collapsed: boolean) {
  change(draft => {
    ids.forEach(id => {
      if (collapsed) draft.collapsedCards[id] = true;
      else delete draft.collapsedCards[id];
    });
  });
}


/* =========================
   Moving Work
   ========================= */

/* Where a dragged item is dropped: onto a sprint's (or the backlog's) heading, or before, */
/* after or inside another item. */
export type Drop = { mode: 'section'; sprintId: string } | { mode: 'before' | 'after' | 'inside'; targetId: string };

/* Whether an item may be dropped there: never inside itself, and only inside an item that can */
/* hold its kind. */
export function canDrop(board: BoardProject, id: string, drop: Drop) {
  const moving = board.items.find(item => item.id === id);
  if (!moving) return false;
  if (drop.mode === 'section') return true;
  const target = board.items.find(item => item.id === drop.targetId);
  if (!target || target.id === moving.id) return false;
  const parent = drop.mode === 'inside' ? target : board.items.find(item => item.id === target.parentId);
  return !parent || (canHoldWork(parent.type, moving.type) && !familyOf(board.items, moving.id).has(parent.id));
}

/* Move an item (with the work inside it in the same section) to where it was dropped, and */
/* number the section's items again in their new order. Work inside it that sits in another */
/* sprint stays where it is. */
export function moveWork(id: string, drop: Drop) {
  change(draft => {
    if (!canDrop(draft, id, drop)) return;
    const moving = draft.items.find(item => item.id === id) as WorkItem;
    const target = drop.mode === 'section' ? null : draft.items.find(item => item.id === drop.targetId) as WorkItem;
    const oldSprint = shownSprintOf(draft, moving);
    const newSprint = target ? shownSprintOf(draft, target) : (drop as { sprintId: string }).sprintId;
    const newParent = !target ? '' : drop.mode === 'inside' ? target.id : target.parentId;

    const family = familyOf(draft.items, moving.id);
    const movingRows = draft.items.filter(item => family.has(item.id) && shownSprintOf(draft, item) === oldSprint).sort(itemOrder);
    const movingIds = new Set(movingRows.map(item => item.id));
    const destination = draft.items.filter(item => shownSprintOf(draft, item) === newSprint && !movingIds.has(item.id)).sort(itemOrder);

    let index = destination.length;
    if (target && drop.mode !== 'inside') {
      index = destination.findIndex(item => item.id === target.id);
      if (index < 0) index = destination.length;
      else if (drop.mode === 'after') index += 1;
    } else if (target) {
      const subtree = familyOf(draft.items, target.id);
      const last = destination.map(item => subtree.has(item.id)).lastIndexOf(true);
      index = last < 0 ? destination.length : last + 1;
    }

    moving.parentId = newParent;
    if (oldSprint !== newSprint) {
      movingRows.forEach(item => {
        item.sprintId = newSprint;
        if (item.type === 'epic') item.manualBacklog = !newSprint;
      });
    }
    destination.splice(index, 0, ...movingRows);
    destination.forEach((item, place) => { item.order = place; });
    if (oldSprint !== newSprint) {
      draft.items.filter(item => shownSprintOf(draft, item) === oldSprint).sort(itemOrder).forEach((item, place) => { item.order = place; });
    }
  });
}


/* =========================
   Team Members
   ========================= */

/* Returns why a name cannot be added, or an empty string when it was added. */
export function addMember(name: string) {
  const clean = text(name, MEMBER_LENGTH);
  if (!clean) return 'Enter a name.';
  if (project.members.some(member => member.toLocaleLowerCase() === clean.toLocaleLowerCase())) return 'That member is already on the team.';
  if (project.members.length >= MAX_MEMBERS) return `A team holds up to ${MAX_MEMBERS} members.`;
  change(draft => { draft.members.push(clean); });
  return '';
}

/* Removing a member unassigns their work. */
export function removeMember(name: string) {
  change(draft => {
    draft.members = draft.members.filter(member => member !== name);
    draft.items.forEach(item => {
      if (item.assignee === name) item.assignee = '';
    });
  });
}
