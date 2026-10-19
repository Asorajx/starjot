import { useState, type CSSProperties } from 'react';
import { Icon } from './Icon';
import { opensNewTab } from '../lib/clicks';
import { useMediaQuery } from '../lib/useMediaQuery';


/* =========================
   Breadcrumb
   ========================= */

/* One step of the path. Steps above the current page open it (Ctrl + click in a new tab). */
export type Crumb = { key: string; label: string; open?: (inNewTab: boolean) => void };

/* How many steps show, counting the current page, before earlier ones fold into "…": fewer on */
/* a phone, so the page bar keeps room for its buttons. */
const SHOWN = 3;
const SHOWN_ON_PHONE = 2;

/* The path to the page shown, in the page bar: Notespace, then a category, parent notes and the */
/* page itself (the last step). Earlier steps past the limit fold into "…", which shows the full */
/* path while pointed at or focused, so every step can still be opened. Steps fade in one after */
/* another as a page opens (not with reduced motion). */
export function Breadcrumb({ items, label = 'Breadcrumb' }: { items: Crumb[]; label?: string }) {
  const phone = useMediaQuery('(max-width: 700px)');
  const [pathOpen, setPathOpen] = useState(false);
  const limit = phone ? SHOWN_ON_PHONE : SHOWN;
  const folded = items.length > limit ? items.slice(0, items.length - limit) : [];
  const shown = items.slice(folded.length);
  const separator = <span className="editor-breadcrumb-separator" aria-hidden="true"><Icon name="chevron-right" size={12} /></span>;

  return (
    <nav className="editor-breadcrumb" aria-label={label}>
      <ol className="editor-crumbs">
        {folded.length > 0 && (
          <li className="editor-crumb-step" style={{ '--crumb': 0 } as CSSProperties}>
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
              <button type="button" className="editor-crumb-link" aria-label="Show the full path" aria-expanded={pathOpen}>
                <Icon name="more-horizontal" size={14} />
              </button>
              {pathOpen && (
                <span className="editor-crumb-path" role="menu" aria-label="Full path">
                  {items.map((crumb, index) => (crumb.open && index < items.length - 1 ? (
                    <button
                      key={crumb.key}
                      type="button"
                      role="menuitem"
                      className="editor-crumb-path-item"
                      style={{ paddingLeft: 12 + index * 12 }}
                      onClick={event => crumb.open?.(opensNewTab(event))}
                    >
                      {crumb.label}
                    </button>
                  ) : (
                    <span key={crumb.key} className="editor-crumb-path-item is-current" style={{ paddingLeft: 12 + index * 12 }}>{crumb.label}</span>
                  )))}
                </span>
              )}
            </span>
          </li>
        )}

        {shown.map((crumb, index) => {
          const current = index === shown.length - 1;
          const order = index + (folded.length ? 1 : 0);
          return (
            <li key={crumb.key} className={`editor-crumb-step ${current ? 'is-current' : ''}`} style={{ '--crumb': order } as CSSProperties}>
              {order > 0 && separator}
              {current || !crumb.open
                ? <span className="editor-crumb-current" aria-current={current ? 'page' : undefined}>{crumb.label}</span>
                : <button type="button" className="editor-crumb-link editor-crumb-parent" onClick={event => crumb.open?.(opensNewTab(event))}>{crumb.label}</button>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
