import { useState } from 'react';
import { isEmoji } from '../../shared/emoji';
import { EMOJI_GROUPS } from './emojiGroups';
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

/* A small panel of emoji in tabs. Any other emoji can be typed or pasted into the box at the bottom */
/* (on Windows, press Windows key + . to open the system emoji panel). */
export function EmojiPicker({ current, onPick, onRemove, onClose }: EmojiPickerProps) {
  const [group, setGroup] = useState(0);
  const [typed, setTyped] = useState('');

  /* Close on Escape or a click outside (Escape without also leaving the note). */
  useDismiss(true, '.emoji-picker', onClose);

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
            className={`emoji-tab ${group === index ? 'is-active' : ''}`}
            onClick={() => setGroup(index)}
          >
            {item.emoji[0]}
          </button>
        ))}
      </div>

      <div className="emoji-group-name">{EMOJI_GROUPS[group].name}</div>
      <div className="emoji-grid" role="tabpanel">
        {EMOJI_GROUPS[group].emoji.map(emoji => (
          <button key={emoji} type="button" className={`emoji-option ${emoji === current ? 'is-current' : ''}`} aria-label={emoji} onClick={() => onPick(emoji)}>
            {emoji}
          </button>
        ))}
      </div>

      <div className="emoji-footer">
        <input
          className="emoji-input"
          type="text"
          placeholder="Or type an emoji"
          aria-label="Type or paste an emoji"
          value={typed}
          onChange={event => setTyped(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && isEmoji(typed.trim())) onPick(typed.trim());
          }}
        />
        {current && <button type="button" className="emoji-remove" onClick={onRemove}>Remove icon</button>}
      </div>
    </div>
  );
}
