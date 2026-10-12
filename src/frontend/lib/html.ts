/* =========================
   HTML Text
   ========================= */

/* Text made safe to put inside HTML markup or an attribute, so it always shows as text. */
export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
}
