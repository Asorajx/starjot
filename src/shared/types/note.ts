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

  /* The description shown in the note's details. */
  subtitle: string;
  preview: string;

  /* The id of the note's category, or an empty string when it has none. */
  category: string;
  updated: string;
  updatedAt: string | null;
  createdAt: string | null;
  date: string;
  pinned: boolean;

  /* An emoji chosen by the user, or an empty string for no icon (the default). */
  icon: string;
  accent: NoteAccent;
  read: string;
  mode: NoteMode;
  stickyIndicator: boolean;

  /* A locked note can be read, selected and commented on, but not edited. */
  locked: boolean;

  /* Hides the details (category, description, dates, comments) under the title. */
  detailsHidden: boolean;
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
export type NoteChanges = Partial<Pick<Note,
  'title' | 'subtitle' | 'category' | 'icon' | 'content' | 'mode' | 'stickyIndicator' | 'locked' | 'detailsHidden' | 'comments'>>;

/* A user-defined group of notes, such as "Work". Notes refer to it by id, so renaming is safe. */
export type Category = {
  id: string;
  name: string;
};

export type SaveStatus = 'saved' | 'saving' | 'unsaved';
