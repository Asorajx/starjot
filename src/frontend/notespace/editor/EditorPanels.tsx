import { useMemo } from 'react';
import { Icon } from '../../components/Icon';
import type { Note, NoteMode } from '../../../shared/types/note';


/* =========================
   Table of Contents
   ========================= */

type TableOfContentsProps = {
  content: string;
  open: boolean;
  onClose: () => void;
};

/* Scroll the editor to the top, a heading (by its position in the note), or the end of the note. */
function jumpTo(target: 'top' | 'bottom' | number) {
  if (target === 'top') {
    document.getElementById('main-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (target === 'bottom') {
    document.getElementById('note-bottom')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  } else {
    document.querySelectorAll('#note-body :is(h1, h2, h3, h4, h5, h6)')[target]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* The outline is generated from the headings in the note's saved content. */
export function TableOfContents({ content, open, onClose }: TableOfContentsProps) {
  const headings = useMemo(() => {
    const template = document.createElement('template');
    template.innerHTML = content;
    return Array.from(template.content.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(heading => ({
      text: heading.textContent?.trim() ?? '',
      nested: ['H3', 'H4', 'H5', 'H6'].includes(heading.tagName)
    }));
  }, [content]);

  const go = (target: 'top' | 'bottom' | number) => {
    jumpTo(target);
    onClose();
  };

  return (
    <section className="editor-flyout editor-toc-flyout" id="note-toc-panel" aria-label="Table of contents" hidden={!open}>
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

type PageOptionsProps = {
  note: Note;
  open: boolean;
  zoom: number;
  onClose: () => void;
  onModeChange: (mode: NoteMode) => void;
  onStickyIndicatorChange: (visible: boolean) => void;
  onZoom: (direction: -1 | 0 | 1) => void;
  onLockChange: (locked: boolean) => void;
  onDelete: () => void;
};

const MODES: { id: NoteMode; title: string; description: string; icon: 'align-left' | 'blocks' }[] = [
  { id: 'continuous', title: 'Continuous', description: 'Normal, flowing document', icon: 'align-left' },
  { id: 'blocks', title: 'Structured blocks', description: 'Individual content elements', icon: 'blocks' }
];

export function PageOptions({ note, open, zoom, onClose, onModeChange, onStickyIndicatorChange, onZoom, onLockChange, onDelete }: PageOptionsProps) {
  return (
    <section className="editor-flyout editor-preferences-flyout" id="note-preferences-panel" aria-label="Page options" hidden={!open}>
      <div className="flyout-heading">
        <strong>Page options</strong>
        <button type="button" className="flyout-close" aria-label="Close page options" onClick={onClose}><Icon name="x" size={17} /></button>
      </div>

      <div className="side-setting">
        <strong>Document structure</strong>
        <p>Choose how this note is organized.</p>
        <div className="editor-mode-options">
          {MODES.map(mode => (
            <button
              key={mode.id}
              type="button"
              className={`mode-option ${note.mode === mode.id ? 'selected' : ''}`}
              aria-pressed={note.mode === mode.id}
              onClick={() => onModeChange(mode.id)}
            >
              <span className="mode-icon"><Icon name={mode.icon} size={18} /></span>
              <span><strong>{mode.title}</strong><small>{mode.description}</small></span>
              <span className="mode-radio" />
            </button>
          ))}
        </div>
        <div className="settings-hint"><Icon name="info" size={14} /> This preference is stored on this note only.</div>
      </div>

      <div className="side-setting side-setting--border">
        <strong>Zoom</strong>
        <p>Make every note larger or smaller. Ctrl + = and Ctrl + − also work.</p>
        <div className="zoom-control" role="group" aria-label="Note zoom">
          <button type="button" className="zoom-button" aria-label="Zoom out" onClick={() => onZoom(-1)}><Icon name="minus" size={15} /></button>
          <button type="button" className="zoom-value" aria-label="Reset zoom to 100%" onClick={() => onZoom(0)}>{Math.round(zoom * 100)}%</button>
          <button type="button" className="zoom-button" aria-label="Zoom in" onClick={() => onZoom(1)}><Icon name="plus" size={15} /></button>
        </div>
      </div>

      <div className="side-setting side-setting--border">
        <strong>Coupled blocks</strong>
        <p>Select content and press Sticky to keep it together on the same printed page.</p>
        <label className="note-switch-row">
          <span>Show sticky indicators</span>
          <input type="checkbox" checked={note.stickyIndicator} onChange={event => onStickyIndicatorChange(event.target.checked)} />
        </label>
        <div className="settings-hint"><Icon name="info" size={14} /> When hidden, brackets still appear while a group is selected or moved.</div>
      </div>

      <div className="side-setting side-setting--border">
        <strong>Editing</strong>
        <p>A locked page can be read, selected and commented on, but not changed.</p>
        <label className="note-switch-row">
          <span><Icon name={note.locked ? 'lock' : 'unlock'} size={14} /> Lock page</span>
          <input type="checkbox" checked={note.locked} onChange={event => onLockChange(event.target.checked)} />
        </label>
      </div>

      <div className="side-setting side-setting--border">
        <strong>Page layout</strong>
        <p>Continuous reading is currently available.</p>
        <div className="layout-option"><Icon name="file-text" size={16} /> Continuous <span><Icon name="check" size={15} /></span></div>
        <div className="layout-option layout-option--disabled"><Icon name="layers" size={16} /> Paginated <em>Planned</em></div>
      </div>

      <div className="side-setting side-setting--border">
        <button type="button" className="danger-option" onClick={onDelete} disabled={note.locked}>
          <Icon name="trash" size={16} /> Delete note
        </button>
        {note.locked && <div className="settings-hint"><Icon name="info" size={14} /> Unlock the page to delete it.</div>}
      </div>
    </section>
  );
}
