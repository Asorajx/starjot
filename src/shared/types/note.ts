/* =========================
   Note Types
   ========================= */

/* Shared by the frontend (screens and editor) and the backend (storage). */

export type NoteMode = 'continuous' | 'blocks';
export type NoteAccent = 'indigo' | 'mint' | 'amber' | 'rose';

/* Content is stored as sanitized HTML; sticky groups are <div class="sticky-group"> wrappers. */
export type Note = {
  id: string;
  title: string;
  subtitle: string;
  preview: string;
  category: string;
  updated: string;
  updatedAt: string | null;
  createdAt: string | null;
  date: string;
  pinned: boolean;
  /* The name of an icon from the frontend's icon set, such as 'layers'. */
  icon: string;
  accent: NoteAccent;
  read: string;
  mode: NoteMode;
  stickyIndicator: boolean;

  /* A locked note can be read, selected and commented on, but not edited. */
  locked: boolean;
  comments: NoteComment[];
  content: string;
};

/* A comment's text is stored here; the commented words are marked in the content */
/* with <span class="comment-mark" data-comment="id">. */
export type NoteComment = {
  id: string;
  text: string;
  createdAt: string;
};

/* The fields an editor may change; everything else is managed by the store. */
export type NoteChanges = Partial<Pick<Note, 'title' | 'content' | 'mode' | 'stickyIndicator' | 'locked' | 'comments'>>;

export type SaveStatus = 'saved' | 'saving' | 'unsaved';
