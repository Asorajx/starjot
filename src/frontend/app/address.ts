import type { BoardTab } from '../../shared/types/board';
import type { Place } from './noteTabs';


/* =========================
   Page Addresses
   ========================= */

/* What the browser's address shows after "#", so Back, Forward, refreshing and bookmarks follow */
/* where you are: #home, #notes, #category=id, #note=id (the same form note links have always */
/* used, see pageAddress) or #board=view. Only the part after "#" changes, which never reaches */
/* the server, so it works on any static host and in the desktop app. */
export type Address = { kind: 'place'; place: Place } | { kind: 'board'; view: BoardTab };

const BOARD_VIEWS: BoardTab[] = ['summary', 'list', 'board', 'timeline'];

/* Views that were removed (the sample status cards), kept so old links and bookmarks open the */
/* Board instead of nothing. */
const OLD_BOARD_VIEWS = ['todo', 'progress', 'review', 'done'];
const ID = /^[a-zA-Z0-9_-]{1,90}$/;

export function addressOf(address: Address) {
  if (address.kind === 'board') return `#board=${address.view}`;
  const { place } = address;
  if (place.kind === 'start') return '#home';
  if (place.kind === 'home') return '#notes';
  if (place.kind === 'category') return `#category=${place.id}`;
  return `#note=${place.id}`;
}

/* The place an address names, or null when it names none (no "#", or something unknown). A */
/* note's address may end with the block a link leads to (see blockInAddress). */
export function parseAddress(hash: string): Address | null {
  const [name, value = ''] = hash.replace(/^#/, '').replace(/&block=[a-z0-9]*$/, '').split('=');
  if (name === 'home' && !value) return { kind: 'place', place: { kind: 'start' } };
  if (name === 'notes' && !value) return { kind: 'place', place: { kind: 'home' } };
  if (name === 'category' && ID.test(value)) return { kind: 'place', place: { kind: 'category', id: value } };
  if (name === 'note' && ID.test(value)) return { kind: 'place', place: { kind: 'note', id: value } };
  if (name === 'board' && BOARD_VIEWS.includes(value as BoardTab)) return { kind: 'board', view: value as BoardTab };
  if (name === 'board' && OLD_BOARD_VIEWS.includes(value)) return { kind: 'board', view: 'board' };
  return null;
}

/* The block a note's address leads to (#note=…&block=…, see pageAddress), or null. */
export function blockInAddress(hash: string) {
  return hash.match(/^#?note=[a-zA-Z0-9_-]{1,90}&block=(l[a-z0-9]{6,24})$/)?.[1] ?? null;
}
