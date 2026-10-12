import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { categoryName, getNote, updatedLabel, useCategories, useNotes } from '../store';
import type { LinkTarget } from './links';


/* =========================
   Link Preview
   ========================= */

/* The site's own small icon (favicon), or a globe when the site has none. The icon is loaded */
/* straight from the site. */
function SiteIcon({ origin }: { origin: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !origin) return <Icon name="globe" size={16} />;
  return <img className="page-preview-favicon" src={`${origin}/favicon.ico`} alt="" width={16} height={16} onError={() => setFailed(true)} />;
}

/* Where a web or email address leads, for its preview: the site's address and name. */
function siteOf(href: string) {
  if (href.toLowerCase().startsWith('mailto:')) return { origin: '', name: href.slice(7) };
  try {
    const url = new URL(href);
    return { origin: url.origin, name: url.hostname.replace(/^www\./, '') };
  } catch {
    return { origin: '', name: href };
  }
}

/* What a link leads to. A page shows its icon, title, category, when it was edited and the */
/* start of its text. A web address shows the site's icon, its name and the full address. (A */
/* fuller website preview, with its title and picture, needs a server to fetch the site, because */
/* browsers do not let one site read another; Starjot's own server could add that later.) */
export function LinkPreviewCard({ target }: { target: LinkTarget }) {
  /* Re-render when notes or categories change, so the preview stays current. */
  useNotes();
  useCategories();

  if (target.kind === 'url') {
    const site = siteOf(target.href);
    return (
      <>
        <span className="page-preview-title">
          {/* Keyed by site, so one site's icon is never left showing for another while it loads. */}
          <SiteIcon key={site.origin} origin={site.origin} />
          <strong>{site.name}</strong>
        </span>
        <span className="page-preview-address">{target.href}</span>
      </>
    );
  }

  const note = getNote(target.id);
  if (!note) return <span className="page-preview-text">This note was deleted.</span>;
  const category = categoryName(note.category);
  return (
    <>
      <span className="page-preview-title">
        {note.icon ? <span aria-hidden="true">{note.icon}</span> : <Icon name="file-text" size={16} />}
        <strong>{note.title || 'Untitled note'}</strong>
      </span>
      <span className="page-preview-meta">{category && `${category} · `}{updatedLabel(note)}</span>
      <span className="page-preview-text">{note.preview || note.subtitle || 'This note is empty.'}</span>
    </>
  );
}
