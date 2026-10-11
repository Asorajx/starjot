import { useEffect } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { placeLabel } from '../notespace/PageBar';
import { useCategories, useNotes } from '../notespace/store';
import { currentPlace, type NoteTab, type Place } from './noteTabs';

type WindowBarProps = {
  tabs: NoteTab[];
  active: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
};

const PLACE_ICONS: Record<Place['kind'], IconName> = { home: 'book-open', category: 'folder', note: 'file-text' };


/* =========================
   Window Bar
   ========================= */

/* The strip at the very top of Notespace, like a window's title bar: one tab for each open page and */
/* a + that starts a new note in a new tab. The active tab joins onto the page below it. */
export function WindowBar({ tabs, active, onSelect, onClose, onNew }: WindowBarProps) {
  /* Re-render when notes or categories are renamed, so the tab titles stay current. */
  useNotes();
  useCategories();

  /* The browser tab is named after the open page, and follows it when the page is renamed. */
  const activeTab = tabs.find(tab => tab.id === active);
  const pageName = activeTab ? placeLabel(currentPlace(activeTab)) : 'Notespace';
  useEffect(() => {
    document.title = `${pageName} — Starjot`;
  }, [pageName]);

  return (
    <div className="window-bar">
      <div className="window-tabs" role="tablist" aria-label="Open pages">
        {tabs.map(tab => {
          const place = currentPlace(tab);
          const label = placeLabel(place);
          const selected = tab.id === active;
          return (
            <div key={tab.id} className={`window-tab ${selected ? 'is-active' : ''} ${place.kind === 'note' ? 'is-note' : ''}`} title={label}>
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
      <button type="button" className="window-new-tab" data-tooltip="New tab" aria-label="New note in a new tab" onClick={onNew}>
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}
