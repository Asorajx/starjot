import { describe, expect, it } from 'vitest';
import { elementOf } from '../../../src/frontend/lib/nodes';
import { isTypeaheadKey, nextByLetter } from '../../../src/frontend/lib/typeahead';

describe('the element a node sits in', () => {
  it('is the element itself, a text node\'s parent, or null', () => {
    const paragraph = document.createElement('p');
    const text = paragraph.appendChild(document.createTextNode('words'));
    expect(elementOf(paragraph)).toBe(paragraph);
    expect(elementOf(text)).toBe(paragraph);
    expect(elementOf(document.createTextNode('loose'))).toBeNull();
    expect(elementOf(null)).toBeNull();
  });
});

describe('jumping to an item by its first letter', () => {
  const labels = ['Open', 'Open in new tab', 'Star', 'Rename', 'Delete note'];

  it('finds the next item starting with the letter, going round to the start', () => {
    expect(nextByLetter(labels, 0, 'r')).toBe(3);
    expect(nextByLetter(labels, 3, 'S')).toBe(2);
    expect(nextByLetter(labels, -1, 'o')).toBe(0);
  });

  it('moves on to the next match when the same letter is typed again, and finds none for a missing letter', () => {
    expect(nextByLetter(labels, 0, 'o')).toBe(1);
    expect(nextByLetter(labels, 1, 'o')).toBe(0);
    expect(nextByLetter(labels, 0, 'z')).toBe(-1);
  });

  it('only counts plain printable keys, not shortcuts', () => {
    const key = (value: string, held: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({ key: value, ctrlKey: false, metaKey: false, altKey: false, ...held });
    expect(isTypeaheadKey(key('a'))).toBe(true);
    expect(isTypeaheadKey(key(' '))).toBe(false);
    expect(isTypeaheadKey(key('ArrowDown'))).toBe(false);
    expect(isTypeaheadKey(key('a', { ctrlKey: true }))).toBe(false);
  });
});
