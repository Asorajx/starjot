import type { BoardTab } from '../../shared/types/task';
import type { Place } from './noteTabs';


/* =========================
   Page Addresses
   ========================= */

/* What the browser's address shows after "#", so Back, Forward, refreshing and bookmarks follow */
/* where you are: #home, #notes, #category=id, #note=id (the same form note links have always */
/* used, see pageAddress) or #board=view. Only the part after "#" changes, which never reaches */
/* the server, so it works on any static host and in the desktop app. */
export type Address = { kind: 'place'; place: Place } | { kind: 'board'; view: BoardTab };

const BOARD_VIEWS: BoardTab[] = ['todo', 'progress', 'review', 'done', 'list', 'timeline'];
const ID = /^[a-zA-Z0-9_-]{1,90}$/;

export function addressOf(address: Address) {
  if (address.kind === 'board') return `#board=${address.view}`;
  const { place } = address;
  if (place.kind === 'start') return '#home';
  if (place.kind === 'home') return '#notes';
  if (place.kind === 'category') return `#category=${place.id}`;
  return `#note=${place.id}`;
}

/* The place an address names, or null when it names none (no "#", or something unknown). */
export function parseAddress(hash: string): Address | null {
  const [name, value = ''] = hash.replace(/^#/, '').split('=');
  if (name === 'home' && !value) return { kind: 'place', place: { kind: 'start' } };
  if (name === 'notes' && !value) return { kind: 'place', place: { kind: 'home' } };
  if (name === 'category' && ID.test(value)) return { kind: 'place', place: { kind: 'category', id: value } };
  if (name === 'note' && ID.test(value)) return { kind: 'place', place: { kind: 'note', id: value } };
  if (name === 'board' && BOARD_VIEWS.includes(value as BoardTab)) return { kind: 'board', view: value as BoardTab };
  return null;
}
