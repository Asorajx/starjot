import { useMemo } from 'react';
import { getPreferences } from '../../app/preferences';
import { STACK_LIMIT } from '../../app/noteTabs';
import { Icon, type IconName } from '../../components/Icon';
import type { EditorSession } from './session';
import type { Note, NoteMode } from '../../../shared/types/note';


/* =========================
   Table of Contents
   ========================= */

type TableOfContentsProps = {
  id: string;
  session: EditorSession;
  content: string;
  open: boolean;
  onClose: () => void;
};

/* Scroll the note's pane to the top, a heading (by its position in the note), or the end of the */
/* note. Settings decides whether it slides smoothly or jumps straight there. */
function jumpTo(session: EditorSession, target: 'top' | 'bottom' | number) {
  const behavior: ScrollBehavior = getPreferences().contentsScroll === 'instant' ? 'instant' : 'smooth';
  const body = session.body();
  if (target === 'top') {
    session.scroller()?.scrollTo({ top: 0, behavior });
  } else if (target === 'bottom') {
    body?.closest('.editor-width')?.querySelector('.document-end')?.scrollIntoView({ behavior, block: 'end' });
  } else {
    body?.querySelectorAll('h1, h2, h3, h4, h5, h6')[target]?.scrollIntoView({ behavior, block: 'start' });
  }
}

/* The outline is generated from the headings in the note's saved content. */
export function TableOfContents({ id, session, content, open, onClose }: TableOfContentsProps) {
  const headings = useMemo(() => {
    const template = document.createElement('template');
    template.innerHTML = content;
    return Array.from(template.content.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(heading => ({
      text: heading.textContent?.trim() ?? '',
      nested: ['H3', 'H4', 'H5', 'H6'].includes(heading.tagName)
    }));
  }, [content]);

  const go = (target: 'top' | 'bottom' | number) => {
    jumpTo(session, target);
    onClose();
  };

  return (
    <section className="editor-flyout editor-toc-flyout" id={id} aria-label="Table of contents" hidden={!open}>
      <div className="flyout-heading">
        <strong>Table of contents</strong>
        <button type="button" className="flyout-close" aria-label="Close table of contents" onClick={onClose}><Icon name="x" size={17} /></button>
      </div>
      <nav className="note-toc-links" aria-label="Headings in this note">
        <button type="button" className="outline-item outline-item--active" onClick={() => go('top')}>Top of note</button>
        {headings.length ? headings.map((heading, index) => (
          <button key={index} type="button" className={`outline-item ${heading.nested ? 'outline-item--nested' : ''}`} onClick={() => go(index)}>
            {heading.text || `Heading ${index + 1}`}
          </button>
        )) : (
          <p className="toc-empty">Add headings to your document to see them here. Type # then Space for a heading, or - then Space for a list.</p>
        )}
        <button type="button" className="outline-item" onClick={() => go('bottom')}>Bottom of note</button>
      </nav>
      <div className="flyout-footnote"><Icon name="info" size={14} /> The outline is generated from headings in this note.</div>
    </section>
  );
}


/* =========================
   Page Options
   ========================= */

/* What Page options can do with the tab group the note is shown in (see app/noteTabs.ts). */
/* split: the direction of a split window, or null. tabCount: the tabs in this note's group. */
export type ViewControls = {
  split: 'right' | 'down' | null;
  stacked: boolean;
  tabCount: number;
  canStack: boolean;
  canUnsplit: boolean;
  onSplit: (direction: 'right' | 'down') => void;
  onStack: () => void;
  onUnsplit: () => void;
};

type PageOptionsProps = {
  id: string;
  note: Note;
  open: boolean;
  zoom: number;
  view: ViewControls;
  onClose: () => void;
  onModeChange: (mode: NoteMode) => void;
  onStickyIndicatorChange: (visible: boolean) => void;
  onZoom: (direction: -1 | 0 | 1) => void;
  onLockChange: (locked: boolean) => void;
  onDelete: () => void;
};

/* Explanations are tooltips on the options, so the panel stays short. */
const MODES: { id: NoteMode; title: string; tooltip: string; icon: IconName }[] = [
  { id: 'continuous', title: 'Continuous', tooltip: 'A normal, flowing document. Stored on this note only.', icon: 'align-left' },
  { id: 'blocks', title: 'Structured blocks', tooltip: 'Individual content elements that can be moved. Stored on this note only.', icon: 'blocks' }
];

/* A split opens a second group of tabs, with its own tab strip, showing this page again. */
const SPLITS: { id: 'right' | 'down'; title: string; tooltip: string; icon: IconName }[] = [
  { id: 'right', title: 'Split right', tooltip: 'Open a second group of tabs beside this one, showing this page again.', icon: 'split-right' },
  { id: 'down', title: 'Split down', tooltip: 'Open a second group of tabs below this one, showing this page again.', icon: 'split-down' }
];

export function PageOptions({ id, note, open, zoom, view, onClose, onModeChange, onStickyIndicatorChange, onZoom, onLockChange, onDelete }: PageOptionsProps) {
  const stackTooltip = view.canStack
    ? `Stack this group's tabs side by side (up to ${STACK_LIMIT}), adding this page again. Two are open at a time; the others fold into strips with their titles.`
    : `A stack holds up to ${STACK_LIMIT} tabs.`;

  return (
    <section className="editor-flyout editor-preferences-flyout" id={id} aria-label="Page options" hidden={!open}>
      <div className="flyout-heading">
        <strong>Page options</strong>
        <button type="button" className="flyout-close" aria-label="Close page options" onClick={onClose}><Icon name="x" size={17} /></button>
      </div>

      <div className="side-setting">
        <strong>Document structure</strong>
        <div className="editor-mode-options">
          {MODES.map(mode => (
            <button
              key={mode.id}
              type="button"
              className={`mode-option ${note.mode === mode.id ? 'selected' : ''}`}
              aria-pressed={note.mode === mode.id}
              data-tooltip={mode.tooltip}
              data-tooltip-align="start"
              data-tooltip-wrap=""
              onClick={() => onModeChange(mode.id)}
            >
              <span className="mode-icon"><Icon name={mode.icon} size={18} /></span>
              <span><strong>{mode.title}</strong></span>
              <span className="mode-radio" />
            </button>
          ))}
        </div>
      </div>

      <div className="side-setting side-setting--border">
        <strong>View</strong>
        <div className="pane-options">
          {SPLITS.map((split, index) => (
            <button
              key={split.id}
              type="button"
              className={`pane-option ${view.split === split.id ? 'selected' : ''}`}
              aria-pressed={view.split === split.id}
              data-tooltip={view.split ? `Show the two groups of tabs ${split.id === 'right' ? 'side by side' : 'one above the other'}.` : split.tooltip}
              data-tooltip-align={index ? 'end' : 'start'}
              data-tooltip-wrap=""
              onClick={() => view.onSplit(split.id)}
            >
              <Icon name={split.icon} size={16} /> {split.title}
            </button>
          ))}
          <button
            type="button"
            className={`pane-option ${view.stacked ? 'selected' : ''}`}
            disabled={!view.canStack}
            data-tooltip={stackTooltip}
            data-tooltip-align="start"
            data-tooltip-wrap=""
            onClick={view.onStack}
          >
            <Icon name="stack" size={16} /> Stack {view.stacked && <em>{view.tabCount}/{STACK_LIMIT}</em>}
          </button>
          <button
            type="button"
            className="pane-option"
            disabled={!view.canUnsplit}
            data-tooltip={view.canUnsplit ? 'Put every tab back into one normal tab strip.' : 'Nothing is split or stacked.'}
            data-tooltip-align="end"
            data-tooltip-wrap=""
            onClick={view.onUnsplit}
          >
            <Icon name="unsplit" size={16} /> Unsplit
          </button>
        </div>
      </div>

      <div className="side-setting side-setting--border">
        <strong>Zoom</strong>
        <div className="zoom-control" role="group" aria-label="Note zoom">
          <button type="button" className="zoom-button" aria-label="Zoom out" onClick={() => onZoom(-1)}><Icon name="minus" size={15} /></button>
          <button type="button" className="zoom-value" aria-label="Reset zoom to 100%" onClick={() => onZoom(0)}>{Math.round(zoom * 100)}%</button>
          <button type="button" className="zoom-button" aria-label="Zoom in" onClick={() => onZoom(1)}><Icon name="plus" size={15} /></button>
        </div>
      </div>

      <div className="side-setting side-setting--border">
        <strong>Coupled blocks</strong>
        <label
          className="note-switch-row"
          data-tooltip="Select content and press Sticky to keep it together on the same printed page. When the indicators are hidden, brackets still appear while a group is selected or moved."
          data-tooltip-align="start"
          data-tooltip-wrap=""
        >
          <span>Show sticky indicators</span>
          <input type="checkbox" checked={note.stickyIndicator} onChange={event => onStickyIndicatorChange(event.target.checked)} />
        </label>
      </div>

      <div className="side-setting side-setting--border">
        <strong>Editing</strong>
        <label
          className="note-switch-row"
          data-tooltip="A locked page can be read, selected and commented on, but not changed."
          data-tooltip-align="start"
          data-tooltip-wrap=""
        >
          <span><Icon name={note.locked ? 'lock' : 'unlock'} size={14} /> Lock page</span>
          <input type="checkbox" checked={note.locked} onChange={event => onLockChange(event.target.checked)} />
        </label>
      </div>

      <div className="side-setting side-setting--border">
        <strong>Page layout</strong>
        <div className="layout-option" data-tooltip="Continuous reading is currently available." data-tooltip-align="start" data-tooltip-wrap="">
          <Icon name="file-text" size={16} /> Continuous <span><Icon name="check" size={15} /></span>
        </div>
        <div className="layout-option layout-option--disabled" data-tooltip="Pages split for printing are planned for later." data-tooltip-align="start" data-tooltip-wrap="">
          <Icon name="layers" size={16} /> Paginated <em>Planned</em>
        </div>
      </div>

      <div className="side-setting side-setting--border">
        <button
          type="button"
          className="danger-option"
          onClick={onDelete}
          disabled={note.locked}
          data-tooltip={note.locked ? 'Unlock the page to delete it.' : undefined}
          data-tooltip-align="start"
        >
          <Icon name="trash" size={16} /> Delete note
        </button>
      </div>
    </section>
  );
}
