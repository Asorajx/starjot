import type { Note } from '../../shared/types/note';


/* =========================
   Backlinks
   ========================= */

/* A link to a note (a.page-link) or a mention of it (span.page-mention) in another note's text. */
/* Sub-note cards (span.page-block) are left out: those notes already show as Sub-notes and in */
/* the breadcrumb. */
const LINK_TAG = /<(?:a|span)\b[^>]*>/g;

function linksTo(content: string, id: string) {
  const target = `data-page="${id}"`;
  if (!content.includes(target)) return false;
  return (content.match(LINK_TAG) ?? []).some(tag => tag.includes(target) && /class="[^"]*\b(?:page-link|page-mention)\b/.test(tag));
}

/* The notes whose text links to or mentions this note, the most recently edited first. */
export function notesLinkingTo(notes: Note[], id: string) {
  return notes
    .filter(note => note.id !== id && linksTo(note.content, id))
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
}
