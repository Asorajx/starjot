import { useState } from 'react';
import { ancestorsOf, categoryName, noteTitle } from '../store';
import type { Note } from '../../../shared/types/note';

type NoteBreadcrumbProps = {
  note: Note;
  onOpenNote: (id: string) => void;
  onOpenCategory: (id: string) => void;
};

/* One step of the path above the current page: its category or a parent page. */
type Crumb = { key: string; label: string; open: () => void };

/* Only this many steps are shown, counting the current page; the rest fold into "…". */
const VISIBLE_CRUMBS = 2;


/* =========================
   Note Breadcrumb
   ========================= */

/* Category / parent pages / this page. A note without a category starts at its top page. */
/* Only the last two steps are shown; earlier ones fold into "…", which shows the full path */
/* on hover or keyboard focus so every step can still be opened. */
export function NoteBreadcrumb({ note, onOpenNote, onOpenCategory }: NoteBreadcrumbProps) {
  const [pathOpen, setPathOpen] = useState(false);
  const category = categoryName(note.category);
  const trail: Crumb[] = [
    ...(category ? [{ key: 'category', label: category, open: () => onOpenCategory(note.category) }] : []),
    ...ancestorsOf(note.id).map(page => ({
      key: page.id,
      label: `${page.icon ? `${page.icon} ` : ''}${noteTitle(page)}`,
      open: () => onOpenNote(page.id)
    }))
  ];
  const shown = trail.slice(-(VISIBLE_CRUMBS - 1));
  const folded = trail.slice(0, -(VISIBLE_CRUMBS - 1));
  const title = noteTitle(note);

  return (
    <nav className="editor-breadcrumb" aria-label="Note breadcrumb">
      {folded.length > 0 && (
        <>
          {/* The full path appears while the pointer or keyboard focus is on "…". */}
          <span
            className="editor-crumb-folded"
            onMouseEnter={() => setPathOpen(true)}
            onMouseLeave={() => setPathOpen(false)}
            onFocus={() => setPathOpen(true)}
            onBlur={event => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPathOpen(false);
            }}
          >
            <button type="button" className="editor-crumb-link" aria-label="Show the full path" aria-expanded={pathOpen}>…</button>
            {pathOpen && (
              <span className="editor-crumb-path" role="menu" aria-label="Full path">
                {trail.map((crumb, index) => (
                  <button
                    key={crumb.key}
                    type="button"
                    role="menuitem"
                    className="editor-crumb-path-item"
                    style={{ paddingLeft: 12 + index * 12 }}
                    onClick={crumb.open}
                  >
                    {crumb.label}
                  </button>
                ))}
                <span className="editor-crumb-path-item is-current" style={{ paddingLeft: 12 + trail.length * 12 }}>
                  {note.icon ? `${note.icon} ` : ''}{title}
                </span>
              </span>
            )}
          </span>
          <span className="editor-breadcrumb-separator">/</span>
        </>
      )}

      {shown.map(crumb => (
        <span key={crumb.key} className="editor-crumb-step">
          <button type="button" className="editor-crumb-link editor-crumb-parent" onClick={crumb.open}>{crumb.label}</button>
          <span className="editor-breadcrumb-separator">/</span>
        </span>
      ))}

      <span className="editor-crumb-current">{title}</span>
    </nav>
  );
}
