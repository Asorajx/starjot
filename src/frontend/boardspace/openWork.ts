import { getBoard } from './board';
import { sprintForNewWork } from './workItems';
import type { EditorTarget } from './WorkEditor';


/* =========================
   Opening Work From Elsewhere
   ========================= */

/* Search and Starjot Home open Boardspace's editor, which belongs to the project frame */
/* (ProjectFrame.tsx): for a work item, or a new task. The request waits here until a frame takes */
/* it: straight away when Boardspace is showing, or as soon as it appears. */
let pending: EditorTarget | null = null;
const listeners = new Set<() => void>();

function request(target: EditorTarget) {
  pending = target;
  listeners.forEach(listener => listener());
}

export function openWorkItem(id: string) {
  request({ kind: 'item', id });
}

/* A new task, in the sprint new work goes into (as Create → Task does). */
export function openNewTask() {
  request({ kind: 'item', type: 'task', sprintId: sprintForNewWork(getBoard()) });
}

/* The waiting request, taken so it opens only once. */
export function takeWorkRequest() {
  const target = pending;
  pending = null;
  return target;
}

export function onWorkRequest(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
