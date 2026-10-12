import { useEffect, type DragEvent, type ReactNode } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { placeLabel } from '../notespace/PageBar';
import { useCategories, useNotes } from '../notespace/store';
import { canAddTab, currentPlace, STACK_LIMIT, type Place, type TabGroup } from './noteTabs';

type WindowBarProps = {
  group: TabGroup;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;

  /* Home and the sidebar button, in the tab bar at the window's top left only. */
  leading?: ReactNode;
};

const PLACE_ICONS: Record<Place['kind'], IconName> = { home: 'book-open', category: 'folder', note: 'file-text' };

/* Dragged tabs carry their group and tab ids under this type, so other drags (text, blocks) are ignored. */
export const TAB_DRAG_TYPE = 'application/x-starjot-tab';

function startTabDrag(event: DragEvent, groupId: string, tabId: string) {
  event.dataTransfer.setData(TAB_DRAG_TYPE, JSON.stringify({ groupId, tabId }));
  event.dataTransfer.effectAllowed = 'move';
}


/* =========================
   Window Bar
   ========================= */

/* The browser tab is named after the focused page, and follows it when the page is renamed. */
export function DocumentTitle({ place }: { place: Place }) {
  /* Re-render when notes or categories are renamed, so the title stays current. */
  useNotes();
  useCategories();
  const pageName = placeLabel(place);
  useEffect(() => {
    document.title = `${pageName} — Starjot`;
  }, [pageName]);
  return null;
}

/* The strip above a tab group, like a window's title bar: one tab for each open page and a + that */
/* starts a new note in a new tab. The active tab joins onto the page below it. A stacked group shows */
/* its tabs as strips beside the pages instead (see StackSpine), so only the + stays here. */
export function WindowBar({ group, onSelect, onClose, onNew, leading }: WindowBarProps) {
  /* Re-render when notes or categories are renamed, so the tab titles stay current. */
  useNotes();
  useCategories();
  const full = !canAddTab(group);

  return (
    <div className="window-bar">
      {leading}
      {!group.stacked && (
        <div className="window-tabs" role="tablist" aria-label="Open tabs">
          {group.tabs.map(tab => {
            const place = currentPlace(tab);
            const label = placeLabel(place);
            const selected = tab.id === group.active;
            return (
              <div
                key={tab.id}
                className={`window-tab ${selected ? 'is-active' : ''} ${place.kind === 'note' ? 'is-note' : ''}`}
                title={label}
                data-tab-id={tab.id}
                draggable
                onDragStart={event => startTabDrag(event, group.id, tab.id)}
              >
                <button type="button" role="tab" className="window-tab-main" aria-selected={selected} onClick={() => onSelect(tab.id)}>
                  <Icon name={PLACE_ICONS[place.kind]} size={14} />
                  <span>{label}</span>
                </button>
                <button type="button" className="window-tab-close" aria-label={`Close ${label}`} onClick={() => onClose(tab.id)}>
                  <Icon name="x" size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <button
        type="button"
        className="window-new-tab"
        data-tooltip={full ? `A stack holds up to ${STACK_LIMIT} tabs` : 'New tab'}
        data-tooltip-align={group.stacked ? 'start' : undefined}
        aria-label="New note in a new tab"
        disabled={full}
        onClick={onNew}
      >
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}

type StackSpineProps = {
  groupId: string;
  tabId: string;
  place: Place;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
};

/* A stacked tab's strip, beside its page: a close button, the page's icon and its title written */
/* downwards. Clicking the strip opens that tab. */
/* It can be dragged like a tab, into another group or to another place in the stack. */
export function StackSpine({ groupId, tabId, place, active, onSelect, onClose }: StackSpineProps) {
  /* Re-render when notes or categories are renamed, so the title stays current. */
  useNotes();
  useCategories();
  const label = placeLabel(place);
  return (
    <div className={`stack-spine ${active ? 'is-active' : ''}`} data-tab-id={tabId} draggable onDragStart={event => startTabDrag(event, groupId, tabId)}>
      <button type="button" className="window-tab-close" aria-label={`Close ${label}`} onClick={onClose}>
        <Icon name="x" size={13} />
      </button>
      <button type="button" className="stack-spine-main" aria-label={label} aria-current={active ? 'page' : undefined} onClick={onSelect}>
        <Icon name={PLACE_ICONS[place.kind]} size={14} />
        <span>{label}</span>
      </button>
    </div>
  );
}
