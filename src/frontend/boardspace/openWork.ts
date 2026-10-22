/* =========================
   Opening Work From Elsewhere
   ========================= */

/* Search opens a work item's editor, which belongs to the project frame (ProjectFrame.tsx). The */
/* request waits here until a frame takes it: straight away when Boardspace is showing, or as */
/* soon as it appears. */
let pending: string | null = null;
const listeners = new Set<() => void>();

export function openWorkItem(id: string) {
  pending = id;
  listeners.forEach(listener => listener());
}

/* The waiting request's work item id, taken so it opens only once. */
export function takeWorkRequest() {
  const id = pending;
  pending = null;
  return id;
}

export function onWorkRequest(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
