/* =========================
   Emoji Check
   ========================= */

/* True for a short piece of text that contains an emoji, such as a note icon. */
/* Some emoji are several characters joined together (for example flags or family emoji), */
/* so the limit is on length rather than "one character". */
export function isEmoji(text: string) {
  return text.length > 0 && text.length <= 16 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(text);
}
