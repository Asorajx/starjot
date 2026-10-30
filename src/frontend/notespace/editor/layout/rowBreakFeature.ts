/* Keep row splitting experimental until browser testing, including a real IME, is signed off. */
/* Saved row choices survive while this is off, but cannot change layout or resizing. */
export const ROW_SPLITTING_ENABLED = import.meta.env.VITE_ENABLE_TABLE_ROW_SPLITTING === 'true';
