import { useSyncExternalStore } from 'react';
import type { IconName } from '../components/Icon';


/* =========================
   Toasts
   ========================= */

/* Short messages in the bottom-right corner, shown from anywhere with showToast. A toast closes */
/* itself after a while unless it is told to stay (stay: true), and a few at most show at once. */
/* Loading toasts become success or error when their work ends (toastWhile). */
export type ToastKind = 'info' | 'success' | 'error' | 'loading';

export type ToastAction = { label: string; run: () => void };

export type Toast = {
  id: string;
  kind: ToastKind;

  /* An icon in place of the kind's own (an alarm clock for a reminder). */
  icon?: IconName;
  title: string;
  description?: string;
  action?: ToastAction;
  stay?: boolean;

  /* True while it fades out, just before it is removed. */
  leaving?: boolean;
};

/* How long a toast stays, how many show at once, and how long fading out takes. */
const SHOWN_FOR = 5000;
export const TOAST_LIMIT = 3;
const LEAVE_TIME = 150;

let toasts: Toast[] = [];
let nextId = 1;
const timers = new Map<string, number>();
const listeners = new Set<() => void>();

function change(next: Toast[]) {
  toasts = next;
  listeners.forEach(listener => listener());
}

/* Show a toast (or replace the one with the same id) and return its id. */
export function showToast(toast: Omit<Toast, 'id' | 'leaving'> & { id?: string }) {
  const id = toast.id ?? `toast-${nextId++}`;
  window.clearTimeout(timers.get(id));
  const shown: Toast = { ...toast, id };
  change(toasts.some(item => item.id === id) ? toasts.map(item => (item.id === id ? shown : item)) : [...toasts, shown]);
  if (!toast.stay && toast.kind !== 'loading') timers.set(id, window.setTimeout(() => closeToast(id), SHOWN_FOR));
  return id;
}

/* Fade a toast out, then remove it. */
export function closeToast(id: string) {
  window.clearTimeout(timers.get(id));
  timers.delete(id);
  if (!toasts.some(item => item.id === id && !item.leaving)) return;
  change(toasts.map(item => (item.id === id ? { ...item, leaving: true } : item)));
  window.setTimeout(() => change(toasts.filter(item => item.id !== id)), LEAVE_TIME);
}

/* A loading toast while work runs, then a success or error toast in its place. */
export async function toastWhile<T>(work: Promise<T>, messages: { loading: string; success: string; error: string }) {
  const id = showToast({ kind: 'loading', title: messages.loading });
  try {
    const result = await work;
    showToast({ id, kind: 'success', title: messages.success });
    return result;
  } catch (error) {
    showToast({ id, kind: 'error', title: messages.error });
    throw error;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/* The toasts showing, newest last (the newest few, when more are waiting). */
export function visibleToasts(all = toasts) {
  return all.slice(-TOAST_LIMIT);
}

export function useToasts() {
  return visibleToasts(useSyncExternalStore(subscribe, () => toasts));
}
