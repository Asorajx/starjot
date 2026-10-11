import type { ReactNode } from 'react';
import { Icon } from '../components/Icon';
import type { Place } from '../app/noteTabs';
import { categoryName, getNote, isStorageAvailable, useCategories, useNotes, useSaveStatus } from './store';

/* Where Back and Forward lead (null when there is nowhere to go), and what they do. */
export type PageHistory = {
  back: Place | null;
  forward: Place | null;
  onBack: () => void;
  onForward: () => void;
};


/* =========================
   Places
   ========================= */

/* The name shown for a place on its tab and in the Back and Forward tooltips. */
export function placeLabel(place: Place) {
  if (place.kind === 'home') return 'All notes';
  if (place.kind === 'category') return categoryName(place.id) || 'Category';
  return getNote(place.id)?.title || 'Untitled note';
}

/* A note or category can be deleted while it is still in a tab's history. */
export function placeExists(place: Place) {
  if (place.kind === 'home') return true;
  if (place.kind === 'category') return Boolean(categoryName(place.id));
  return Boolean(getNote(place.id));
}


/* =========================
   Page Bar
   ========================= */

/* Back and forward through the places this tab has shown, like a browser's arrows. */
export function HistoryButtons({ history }: { history: PageHistory }) {
  /* Re-render when notes or categories are renamed, so the tooltips stay current. */
  useNotes();
  useCategories();
  const backLabel = history.back ? `Back to ${placeLabel(history.back)}` : 'Back';
  const forwardLabel = history.forward ? `Forward to ${placeLabel(history.forward)}` : 'Forward';

  return (
    <span className="page-bar-group" role="group" aria-label="History">
      <button type="button" className="page-bar-button" data-tooltip={backLabel} data-tooltip-align="start" aria-label={backLabel} disabled={!history.back} onClick={history.onBack}>
        <Icon name="arrow-left" size={17} />
      </button>
      <button type="button" className="page-bar-button" data-tooltip={forwardLabel} aria-label={forwardLabel} disabled={!history.forward} onClick={history.onForward}>
        <Icon name="arrow-right" size={17} />
      </button>
    </span>
  );
}

/* Whether the latest edits are stored: a spinning loader while saving, a tick once saved, and a */
/* warning when the browser refuses to keep notes (for example in some private windows). */
export function SaveStatus() {
  const status = useSaveStatus();
  const unavailable = !isStorageAvailable();
  const label = unavailable ? 'Not saved: this browser is not keeping notes' : status === 'saving' ? 'Saving…' : 'Saved';
  const icon = unavailable ? 'alert-triangle' : status === 'saving' ? 'loader' : 'check';

  return (
    <span className={`save-status is-${unavailable ? 'unsaved' : status}`} id="note-save-state" role="status" tabIndex={0} data-tooltip={label} aria-label={label}>
      <Icon name={icon} size={15} />
    </span>
  );
}

type PageBarProps = {
  history: PageHistory;
  className?: string;
  children?: ReactNode;
};

/* The bar at the top of a page: back and forward first, then whatever the page adds (its path, */
/* save status and page buttons). It shares the page's background so it reads as part of the page. */
export function PageBar({ history, className = '', children }: PageBarProps) {
  return (
    <div className={`page-bar ${className}`.trim()}>
      <HistoryButtons history={history} />
      {children}
    </div>
  );
}
