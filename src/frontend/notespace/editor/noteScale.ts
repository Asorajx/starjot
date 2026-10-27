/* =========================
   Note Text Size
   ========================= */

/* A note's 100% zoom shows it at this size, so its text reads comfortably (about 16px for body */
/* text, which is styled at 13px), on phones too: there the note fills the width to a 16px */
/* edge, which still fits about 45 characters a line. Zoom and Small text scale from here, and a */
/* PDF prints the text at the same size (see exportHtml.ts). */
export const BASE_SCALE = 1.2;

/* Small text shows a note at this share of its size. */
export const SMALL_TEXT_SCALE = 0.875;
