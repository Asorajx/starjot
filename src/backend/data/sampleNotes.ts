import type { Note } from '../../shared/types/note';


/* =========================
   Welcome Note
   ========================= */

/* A short introduction for a new workspace; users can edit or delete it. */
export const SAMPLE_NOTES: Partial<Note>[] = [
  { id: 'welcome', title: 'Welcome to Starjot', subtitle: 'A place for your notes and ideas.', preview: 'A place for your notes and ideas.', category: '', pinned: false }
];

export const SAMPLE_CONTENT: Record<string, string> = {
  welcome: '<p>Welcome to Starjot, a place for your notes and ideas.</p>'
    + '<h2>Make a note your own</h2>'
    + '<p>Write freely and use <strong>bold</strong> or <em>italic</em> text to highlight what matters. Headings like this one help organise longer notes.</p>'
    + '<ul><li>Collect ideas in a list.</li><li>Star important notes to find them quickly.</li><li>Link related notes to keep your thoughts connected.</li></ul>'
    + '<h2>A little checklist</h2>'
    + '<ul class="checklist"><li class="is-checked">Open your welcome note</li><li>Try ticking this item</li><li>Create a note of your own</li></ul>'
    + '<blockquote>Make space for the things you want to remember.</blockquote>'
    + '<p>Visit Boardspace to plan your work. You can edit or delete this note whenever you like.</p>'
};
