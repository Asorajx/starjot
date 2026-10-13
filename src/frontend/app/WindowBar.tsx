import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { placeLabel } from '../notespace/PageBar';
import { useCategories, useNotes } from '../notespace/store';
import { useDismiss } from '../lib/useDismiss';
import { useMediaQuery } from '../lib/useMediaQuery';
import { canAddTab, currentPlace, STACK_LIMIT, type NoteTab, type Place, type TabGroup } from './noteTabs';

type WindowBarProps = {
  group: TabGroup;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;

  /* Home and the sidebar button, in the tab bar at the window's top left only. */
  leading?: ReactNode;
};

const PLACE_ICONS: Record<Place['kind'], IconName> = { start: 'home', home: 'book-open', category: 'folder', note: 'file-text' };

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
/* On a phone, more than two tabs do not fit: the open tab is shown with one more tab that holds */
/* all the others (see OtherTabs). */
export function WindowBar({ group, onSelect, onClose, onNew, leading }: WindowBarProps) {
  /* Re-render when notes or categories are renamed, so the tab titles stay current. */
  useNotes();
  useCategories();
  const full = !canAddTab(group);
  const phone = useMediaQuery('(max-width: 700px)');
  const gathered = phone && group.tabs.length > 2;

  function tabElement(tab: NoteTab) {
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
  }

  return (
    <div className="window-bar">
      {leading}
      {!group.stacked && (
        <div className={`window-tabs ${gathered ? 'is-gathered' : ''}`} role="tablist" aria-label="Open tabs">
          {gathered ? (
            <>
              {group.tabs.filter(tab => tab.id === group.active).map(tabElement)}
              <OtherTabs tabs={group.tabs.filter(tab => tab.id !== group.active)} onSelect={onSelect} onClose={onClose} />
            </>
          ) : group.tabs.map(tabElement)}
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

type OtherTabsProps = {
  tabs: NoteTab[];
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
};

/* On a phone with more than two tabs, the tabs that are not open share one tab, "3 tabs". Tapping */
/* it lists them below: tap one to switch to it, or its × to close it. Tapping anywhere else, or */
/* Escape, closes the list and keeps every tab. */
function OtherTabs({ tabs, onSelect, onClose }: OtherTabsProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useDismiss(open, '.window-tab-others, .tab-list-menu', () => setOpen(false));
  const box = open ? buttonRef.current?.getBoundingClientRect() : null;

  return (
    <div className={`window-tab window-tab-others ${open ? 'is-open' : ''}`}>
      <button
        ref={buttonRef}
        type="button"
        className="window-tab-main"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name="layers" size={14} />
        <span>{tabs.length} tabs</span>
        <Icon name="chevron-down" size={14} />
      </button>
      {open && box && (
        <div className="page-menu tab-list-menu" role="group" aria-label="Other tabs" style={{ top: box.bottom + 4, right: Math.max(8, window.innerWidth - box.right) }}>
          {tabs.map(tab => {
            const place = currentPlace(tab);
            const label = placeLabel(place);
            return (
              <div key={tab.id} className="tab-list-row">
                <button
                  type="button"
                  className="page-menu-item"
                  onClick={() => {
                    setOpen(false);
                    onSelect(tab.id);
                  }}
                >
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


/* =========================
   Tab Switcher
   ========================= */

type TabSwitcherProps = {
  tabs: NoteTab[];
  selected: number;
  onPick: (id: string) => void;
};

/* The list Ctrl + Q shows while Ctrl is held: every open tab, the most recently used first, with */
/* the one Ctrl's release will switch to highlighted (see App.tsx). It only appears after a short */
/* moment, so a quick Ctrl + Q (back to the last tab) does not flash it. A click picks a tab too. */
export function TabSwitcher({ tabs, selected, onPick }: TabSwitcherProps) {
  /* Re-render when notes or categories are renamed, so the titles stay current. */
  useNotes();
  useCategories();
  return (
    <div className="page-menu tab-switcher" role="listbox" aria-label="Switch tab">
      {tabs.map((tab, index) => {
        const place = currentPlace(tab);
        return (
          <button
            key={tab.id}
            type="button"
            role="option"
            aria-selected={index === selected}
            className={`page-menu-item ${index === selected ? 'is-selected' : ''}`}
            onMouseDown={event => event.preventDefault()}
            onClick={() => onPick(tab.id)}
          >
            <Icon name={PLACE_ICONS[place.kind]} size={14} />
            <span>{placeLabel(place)}</span>
          </button>
        );
      })}
    </div>
  );
}
