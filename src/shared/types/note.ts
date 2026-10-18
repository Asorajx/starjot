/* =========================
   Note Types
   ========================= */

/* Shared by the frontend (screens and editor) and the backend (storage). */
export type NoteMode = 'continuous' | 'blocks';

/* Pageless shows the note as one long page; paginated shows it on page-sized sheets. */
export type PageLayout = 'pageless' | 'paginated';
export type PageSize = 'a4' | 'letter';

/* A document is text on a page; a canvas is an endless space to draw on, with no page. A note */
/* keeps its kind for good. */
export type NoteKind = 'document' | 'canvas';

/* A colour chosen for a note, shown on it in lists and previews (the same names as the text */
/* colours, so dark mode has them too), or an empty string for none (the default). */
export const NOTE_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'brown'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number] | '';

/* Content is stored as sanitized HTML; sticky groups are <div class="sticky-group"> wrappers. */
export type Note = {
  id: string;
  kind: NoteKind;
  title: string;

  /* The description shown in the note's details. */
  subtitle: string;
  preview: string;

  /* The id of the note's category, or an empty string when it has none. */
  category: string;
  updated: string;
  updatedAt: string | null;
  createdAt: string | null;

  /* When the note was last opened, used to sort notes by "Last opened". */
  openedAt: string | null;
  date: string;
  pinned: boolean;

  /* An emoji chosen by the user, or an empty string for no icon (the default). */
  icon: string;
  color: NoteColor;
  read: string;
  mode: NoteMode;
  stickyIndicator: boolean;

  /* Paginated notes are shown on sheets of this size, turned sideways when landscape is true. */
  layout: PageLayout;
  pageSize: PageSize;
  landscape: boolean;

  /* Pageless notes only: smallText makes the note's text smaller while it keeps its width, and */
  /* fullWidth lets the text use the full width of the pane instead of a centred column. */
  smallText: boolean;
  fullWidth: boolean;

  /* Canvases only: hides the dots in the background, leaving it plain. */
  dotsHidden: boolean;

  /* A locked note can be read, selected and commented on, but not edited. */
  locked: boolean;

  /* While a locked note is unlocked for a short time, when it locks again (an ISO date), or null. */
  unlockedUntil: string | null;

  /* Hides the details (category, description, dates, comments) under the title. */
  detailsHidden: boolean;

  /* Folds the list of sub-pages in the details, while the other details stay visible. */
  pagesHidden: boolean;

  /* The id of the page this note sits inside, or an empty string for a top-level note. */
  parentId: string;
  comments: NoteComment[];
  content: string;

  /* Pen and highlighter strokes drawn over the note in drawing mode, oldest first. */
  drawing: DrawingStroke[];

  /* The drawing's layers from bottom to top. The entry with the id "text" marks where the note's */
  /* text sits among them: layers before it are drawn under the text, layers after it over it. */
  drawingLayers: DrawingLayerInfo[];

  /* Free remarks about the note, written in the details (sanitized HTML). They are not part of the */
  /* note's text, so they never appear in previews. */
  remarks: string;
};

/* A comment's text is stored here; the commented words are marked in the content */
/* with <span class="comment-mark" data-comment="id">. */
export type NoteComment = {
  id: string;
  text: string;
  createdAt: string;
};

/* A pen draws solid lines; a highlighter draws wide see-through lines under the pen strokes. */
export type DrawingTool = 'pen' | 'highlighter';

/* One line drawn in drawing mode. */
export type DrawingStroke = {
  tool: DrawingTool;

  /* A hex colour such as #e5484d, or "ink": the colour of the note's text, which follows light */
  /* and dark mode. */
  color: string;

  /* The line's width in pixels. */
  size: number;

  /* The line's points as x, y, x, y… in pixels from the top-left corner of the note's text */
  /* column, at 100% zoom. Drawings stay where they are drawn, whatever the text does. */
  points: number[];

  /* The id of the layer the stroke is on. Strokes without one (or whose layer is gone) are shown */
  /* on the first layer above the text. */
  layer?: string;
};

/* One layer of a note's drawing. Hidden layers are not shown, and cannot be drawn on. */
export type DrawingLayerInfo = {
  id: string;
  name: string;
  hidden: boolean;
};

/* The fields an editor may change; everything else is managed by the store. */
export type NoteChanges = Partial<Pick<Note,
  'title' | 'subtitle' | 'category' | 'icon' | 'content' | 'mode' | 'stickyIndicator' | 'layout' | 'pageSize' | 'landscape' | 'smallText' | 'fullWidth' | 'dotsHidden' | 'locked'
  | 'detailsHidden'
  | 'pagesHidden' | 'comments' | 'remarks' | 'drawing' | 'drawingLayers'>>;

/* A user-defined group of notes, such as "Work". Notes refer to it by id, so renaming is safe. */
export type Category = {
  id: string;
  name: string;
};

export type SaveStatus = 'saved' | 'saving' | 'unsaved';
