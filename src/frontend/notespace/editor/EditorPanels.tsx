import { useEffect, useMemo, useState } from 'react';
import { getPreferences } from '../../app/preferences';
import { STACK_LIMIT } from '../../app/noteTabs';
import { Switch } from '../../components/Switch';
import { Icon, type IconName } from '../../components/Icon';
import { NoteColorPicker } from '../NoteColors';
import { showTabOf, tabPathOf } from './text/tabs';
import type { EditorSession } from './session';
import type { Note, NoteMode, PageLayout, PageSize } from '../../../shared/types/note';


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
    /* A heading inside a tab block shows its tab first, so there is something to scroll to. */
    const heading = body?.querySelectorAll('h1, h2, h3, h4, h5, h6')[target];
    showTabOf(heading ?? null);
    heading?.scrollIntoView({ behavior, block: 'start' });
  }
}

/* The outline is generated from the headings in the note's saved content. A heading inside a */
/* tab block is indented and named with its tab, such as "Setup › Install". */
export function TableOfContents({ id, session, content, open, onClose }: TableOfContentsProps) {
  const headings = useMemo(() => {
    const template = document.createElement('template');
    template.innerHTML = content;
    return Array.from(template.content.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(heading => ({
      text: heading.textContent?.trim() ?? '',
      tabs: tabPathOf(heading),
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
          <button
            key={index}
            type="button"
            className={`outline-item ${heading.nested || heading.tabs.length ? 'outline-item--nested' : ''} ${heading.tabs.length ? 'outline-item--in-tab' : ''}`}
            onClick={() => go(index)}
          >
            {heading.tabs.length > 0 && <span className="outline-tab">{heading.tabs.join(' › ')} › </span>}
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
   Note Settings
   ========================= */

/* What Note settings can do with the tab group the note is shown in (see app/noteTabs.ts). */
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

type NoteSettingsProps = {
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
  onPageChange: (changes: { layout?: PageLayout; pageSize?: PageSize; landscape?: boolean; smallText?: boolean; fullWidth?: boolean }) => void;
  onCopyLink: () => Promise<void>;

  /* Opens the Export window. */
  onExport: () => void;
  onDelete: () => void;
};

const LAYOUTS: { id: PageLayout; title: string; tooltip: string; icon: IconName }[] = [
  { id: 'pageless', title: 'Pageless', tooltip: 'One long page without page breaks. Stored on this note only.', icon: 'file-text' },
  { id: 'paginated', title: 'Paginated', tooltip: 'Shown on page-sized sheets, so you can see where printed pages break. Stored on this note only.', icon: 'layers' }
];

/* Explanations are tooltips on the options, so the panel stays short. */
const MODES: { id: NoteMode; title: string; tooltip: string; icon: IconName }[] = [
  { id: 'continuous', title: 'Continuous', tooltip: 'A normal, flowing document. Stored on this note only.', icon: 'align-left' },
  { id: 'blocks', title: 'Block', tooltip: 'Individual content elements that can be moved. Stored on this note only.', icon: 'blocks' }
];

/* A split opens a second group of tabs, with its own tab strip, showing this page again. */
const SPLITS: { id: 'right' | 'down'; title: string; tooltip: string; icon: IconName }[] = [
  { id: 'right', title: 'Split right', tooltip: 'Open a second group of tabs beside this one, showing this note again.', icon: 'split-right' },
  { id: 'down', title: 'Split down', tooltip: 'Open a second group of tabs below this one, showing this note again.', icon: 'split-down' }
];

export function NoteSettings({
  id, note, open, zoom, view, onClose, onModeChange, onStickyIndicatorChange, onZoom, onLockChange, onPageChange, onCopyLink, onExport, onDelete
}: NoteSettingsProps) {
  /* "Copied" shows until the panel is closed. */
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const stackTooltip = view.canStack
    ? `Stack this group's tabs side by side (up to ${STACK_LIMIT}), adding this note again. Two are open at a time; the others fold into strips with their titles.`
    : `A stack holds up to ${STACK_LIMIT} tabs.`;

  return (
    <section className="editor-flyout note-settings-flyout" id={id} aria-label="Note settings" hidden={!open}>
      <div className="flyout-heading">
        <strong>Note settings</strong>
        <button type="button" className="flyout-close" aria-label="Close note settings" onClick={onClose}><Icon name="x" size={17} /></button>
      </div>

      <div className="option-grid is-three">
        <button
          type="button"
          className={`option-tile ${copied ? 'selected' : ''}`}
          data-tooltip="Copies this note's address. Pasted into a note it becomes a link to this note; opened in a browser it opens this note."
          data-tooltip-align="start"
          data-tooltip-wrap=""
          onClick={() => onCopyLink().then(() => setCopied(true)).catch(() => undefined)}
        >
          <Icon name={copied ? 'check' : 'link'} size={16} /> {copied ? 'Copied' : 'Copy link'}
        </button>
        <button
          type="button"
          className="option-tile"
          data-tooltip="Save this note as a PDF, HTML, Markdown or plain text file."
          data-tooltip-wrap=""
          onClick={onExport}
        >
          <Icon name="download" size={16} /> Export
        </button>
        <button
          type="button"
          className={`option-tile ${note.locked ? 'selected' : ''}`}
          aria-pressed={note.locked}
          data-tooltip="A locked note can be read, selected and commented on, but not changed."
          data-tooltip-align="end"
          data-tooltip-wrap=""
          onClick={() => onLockChange(!note.locked)}
        >
          <Icon name={note.locked ? 'lock' : 'unlock'} size={16} /> {note.locked ? 'Locked' : 'Lock'}
        </button>
      </div>

      {/* The note's colour shows in lists and previews; choosing one is not an edit. */}
      <div className="side-setting side-setting--border">
        <strong>Colour</strong>
        <NoteColorPicker noteId={note.id} color={note.color} />
      </div>

      <div className="side-setting side-setting--border">
        <strong>Structure</strong>
        <div className="option-grid">
          {MODES.map((mode, index) => (
            <button
              key={mode.id}
              type="button"
              className={`option-tile ${note.mode === mode.id ? 'selected' : ''}`}
              aria-pressed={note.mode === mode.id}
              data-tooltip={mode.tooltip}
              data-tooltip-align={index ? 'end' : 'start'}
              data-tooltip-wrap=""
              onClick={() => onModeChange(mode.id)}
            >
              <Icon name={mode.icon} size={16} /> {mode.title}
            </button>
          ))}
        </div>
      </div>

      <div className="side-setting side-setting--border">
        <strong>Layout</strong>
        <div className="option-grid">
          {LAYOUTS.map((layout, index) => (
            <button
              key={layout.id}
              type="button"
              className={`option-tile ${note.layout === layout.id ? 'selected' : ''}`}
              aria-pressed={note.layout === layout.id}
              data-tooltip={layout.tooltip}
              data-tooltip-align={index ? 'end' : 'start'}
              data-tooltip-wrap=""
              onClick={() => onPageChange({ layout: layout.id })}
            >
              <Icon name={layout.icon} size={16} /> {layout.title}
            </button>
          ))}
        </div>
        {note.layout === 'paginated' && (
          <>
            <div className="option-row" role="group" aria-label="Page size">
              <span>Size</span>
              {(['a4', 'letter'] as const).map(size => (
                <button key={size} type="button" className={`option-chip ${note.pageSize === size ? 'selected' : ''}`} aria-pressed={note.pageSize === size} onClick={() => onPageChange({ pageSize: size })}>
                  {size === 'a4' ? 'A4' : 'Letter'}
                </button>
              ))}
            </div>
            <div className="option-row" role="group" aria-label="Orientation">
              <span>Orientation</span>
              {[false, true].map(landscape => (
                <button key={String(landscape)} type="button" className={`option-chip ${note.landscape === landscape ? 'selected' : ''}`} aria-pressed={note.landscape === landscape} onClick={() => onPageChange({ landscape })}>
                  {landscape ? 'Landscape' : 'Portrait'}
                </button>
              ))}
            </div>
          </>
        )}
        <label
          className="note-switch-row"
          data-tooltip="Select content and press Sticky to keep it together on the same printed page. When the indicators are hidden, brackets still appear while a group is selected or moved."
          data-tooltip-align="start"
          data-tooltip-wrap=""
        >
          <span>Show sticky indicators</span>
          <Switch label="Show sticky indicators" on={note.stickyIndicator} onChange={onStickyIndicatorChange} />
        </label>

        {/* Pages have a fixed paper size, so these two only work on pageless notes. */}
        <label
          className="note-switch-row"
          data-tooltip={note.layout === 'paginated' ? 'Only for Pageless notes.' : 'Smaller text, so more words fit on each line. The note keeps its width.'}
          data-tooltip-align="start"
          data-tooltip-wrap=""
        >
          <span>Small text</span>
          <Switch label="Small text" on={note.smallText} disabled={note.layout === 'paginated'} onChange={smallText => onPageChange({ smallText })} />
        </label>
        <label
          className="note-switch-row"
          data-tooltip={note.layout === 'paginated' ? 'Only for Pageless notes.' : 'Let the text use the full width of the window, with less space at the sides.'}
          data-tooltip-align="start"
          data-tooltip-wrap=""
        >
          <span>Full width</span>
          <Switch label="Full width" on={note.fullWidth} disabled={note.layout === 'paginated'} onChange={fullWidth => onPageChange({ fullWidth })} />
        </label>
      </div>

      <div className="side-setting side-setting--border">
        <strong>View</strong>
        <div className="option-grid is-icons">
          {SPLITS.map((split, index) => (
            <button
              key={split.id}
              type="button"
              className={`option-tile ${view.split === split.id ? 'selected' : ''}`}
              aria-pressed={view.split === split.id}
              aria-label={split.title}
              data-tooltip={`${split.title}: ${view.split ? `show the two groups of tabs ${split.id === 'right' ? 'side by side' : 'one above the other'}.` : split.tooltip}`}
              data-tooltip-align={index ? undefined : 'start'}
              data-tooltip-wrap=""
              onClick={() => view.onSplit(split.id)}
            >
              <Icon name={split.icon} size={16} />
            </button>
          ))}
          <button
            type="button"
            className={`option-tile ${view.stacked ? 'selected' : ''}`}
            disabled={!view.canStack}
            aria-label={view.stacked ? `Stack, ${view.tabCount} of ${STACK_LIMIT}` : 'Stack'}
            data-tooltip={`Stack: ${stackTooltip}`}
            data-tooltip-wrap=""
            onClick={view.onStack}
          >
            <Icon name="stack" size={16} /> {view.stacked && <em>{view.tabCount}/{STACK_LIMIT}</em>}
          </button>
          <button
            type="button"
            className="option-tile"
            disabled={!view.canUnsplit}
            aria-label="Unsplit"
            data-tooltip={`Unsplit: ${view.canUnsplit ? 'put every tab back into one normal tab strip.' : 'nothing is split or stacked.'}`}
            data-tooltip-align="end"
            data-tooltip-wrap=""
            onClick={view.onUnsplit}
          >
            <Icon name="unsplit" size={16} />
          </button>
        </div>
        <div className="option-row">
          <span>Zoom</span>
          <div className="zoom-control" role="group" aria-label="Note zoom">
            <button type="button" className="zoom-button" aria-label="Zoom out" onClick={() => onZoom(-1)}><Icon name="minus" size={15} /></button>
            <button type="button" className="zoom-value" aria-label="Reset zoom to 100%" onClick={() => onZoom(0)}>{Math.round(zoom * 100)}%</button>
            <button type="button" className="zoom-button" aria-label="Zoom in" onClick={() => onZoom(1)}><Icon name="plus" size={15} /></button>
          </div>
        </div>
      </div>

      <div className="side-setting side-setting--border">
        <button
          type="button"
          className="danger-option"
          onClick={onDelete}
          disabled={note.locked}
          data-tooltip={note.locked ? 'Unlock the note to delete it.' : undefined}
          data-tooltip-align="start"
        >
          <Icon name="trash" size={16} /> Delete note
        </button>
      </div>
    </section>
  );
}
