import { describe, expect, it } from 'vitest';
import { EMOJI_GROUPS, EMOJI_NAMES, searchEmoji } from '../../../src/frontend/components/emojiGroups';

describe('searching the emoji picker', () => {
  it('names every emoji the picker offers', () => {
    EMOJI_GROUPS.flatMap(group => group.emoji).forEach(emoji => expect(EMOJI_NAMES[emoji], emoji).toBeTruthy());
  });

  it('finds emoji in every tab by the start of their words, all words typed counting', () => {
    expect(searchEmoji('heart')).toContain('❤️');
    expect(searchEmoji('heart')).toContain('😍');
    expect(searchEmoji('green he')).toEqual(['💚']);
    expect(searchEmoji('CAT')).toEqual(['🐱']);
  });

  it('lists an emoji once even when two tabs offer it, and nothing for no match', () => {
    expect(searchEmoji('star').filter(emoji => emoji === '⭐')).toHaveLength(1);
    expect(searchEmoji('zzzzz')).toEqual([]);
    expect(searchEmoji('   ')).toEqual([]);
  });
});
