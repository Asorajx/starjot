import { useState } from 'react';
import { isEmoji } from '../../shared/emoji';
import { EMOJI_GROUPS, searchEmoji } from './emojiGroups';
import { useDismiss } from '../lib/useDismiss';

type EmojiPickerProps = {
  current: string;
  onPick: (emoji: string) => void;
  onRemove: () => void;
  onClose: () => void;
};


/* =========================
   Emoji Picker
   ========================= */

/* A small panel of emoji in tabs. Words typed into the box at the bottom search every tab by */
/* name (Enter picks the first match); any other emoji can be pasted or typed there too (on */
/* Windows, press Windows key + . to open the system emoji panel). */
export function EmojiPicker({ current, onPick, onRemove, onClose }: EmojiPickerProps) {
  const [group, setGroup] = useState(0);
  const [typed, setTyped] = useState('');

  /* Close on Escape or a click outside (Escape without also leaving the note). */
  useDismiss(true, '.emoji-picker', onClose);
  const query = typed.trim();
  const searching = Boolean(query) && !isEmoji(query);
  const shown = searching ? searchEmoji(query) : EMOJI_GROUPS[group].emoji;

  return (
    <div className="emoji-picker" role="dialog" aria-label="Choose an icon">
      <div className="emoji-tabs" role="tablist" aria-label="Emoji groups">
        {EMOJI_GROUPS.map((item, index) => (
          <button
            key={item.name}
            type="button"
            role="tab"
            aria-selected={group === index}
            aria-label={item.name}
            className={`emoji-tab ${group === index && !searching ? 'is-active' : ''}`}
            onClick={() => {
              setGroup(index);
              setTyped('');
            }}
          >
            {item.emoji[0]}
          </button>
        ))}
      </div>

      <div className="emoji-group-name">{searching ? 'Results' : EMOJI_GROUPS[group].name}</div>
      {searching && !shown.length && <p className="emoji-empty">No emoji found. Paste any emoji here to use it.</p>}
      <div className="emoji-grid" role="tabpanel">
        {shown.map(emoji => (
          <button key={emoji} type="button" className={`emoji-option ${emoji === current ? 'is-current' : ''}`} aria-label={emoji} onClick={() => onPick(emoji)}>
            {emoji}
          </button>
        ))}
      </div>

      <div className="emoji-footer">
        <input
          className="emoji-input"
          type="text"
          placeholder="Search, or paste an emoji"
          aria-label="Search emoji, or type or paste one"
          autoFocus
          value={typed}
          onChange={event => setTyped(event.target.value)}
          onKeyDown={event => {
            if (event.key !== 'Enter') return;
            if (isEmoji(query)) onPick(query);
            else if (searching && shown[0]) onPick(shown[0]);
          }}
        />
        {current && <button type="button" className="emoji-remove" onClick={onRemove}>Remove icon</button>}
      </div>
    </div>
  );
}
