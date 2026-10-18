import { Icon } from '../components/Icon';
import { setNoteColor } from './store';
import { NOTE_COLORS, type NoteColor } from '../../shared/types/note';


/* =========================
   Note Colours
   ========================= */

/* Colours are drawn with the text colour classes (text-red and so on) and currentColor, so they */
/* follow the same light and dark shades as coloured text. */
const COLOR_LABELS: Record<Exclude<NoteColor, ''>, string> = {
  red: 'Red', orange: 'Orange', yellow: 'Yellow', green: 'Green', blue: 'Blue', purple: 'Purple', pink: 'Pink', brown: 'Brown'
};

/* A thin bar in the note's colour, on the edge of a row, card or preview. Nothing for no colour. */
export function NoteColorStrip({ color }: { color: NoteColor }) {
  if (!color) return null;
  return <span className={`note-color-strip text-${color}`} aria-hidden="true" />;
}

/* A row of swatches choosing a note's colour, None first. */
export function NoteColorPicker({ noteId, color }: { noteId: string; color: NoteColor }) {
  return (
    <div className="note-color-picker" role="radiogroup" aria-label="Note colour">
      <button
        type="button"
        role="radio"
        className="note-color-swatch is-none"
        aria-checked={!color}
        aria-label="No colour"
        data-tooltip="No colour"
        onClick={() => setNoteColor(noteId, '')}
      >
        <Icon name="x" size={12} />
      </button>
      {NOTE_COLORS.map(option => (
        <button
          key={option}
          type="button"
          role="radio"
          className={`note-color-swatch text-${option}`}
          aria-checked={color === option}
          aria-label={COLOR_LABELS[option]}
          data-tooltip={COLOR_LABELS[option]}
          onClick={() => setNoteColor(noteId, option)}
        />
      ))}
    </div>
  );
}
