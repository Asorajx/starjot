import { beforeEach, describe, expect, it } from 'vitest';
import { readCategories, writeCategories } from '../../src/backend/storage/categoriesStorage';
import { isEmoji } from '../../src/shared/emoji';

beforeEach(() => localStorage.clear());


/* =========================
   Categories Storage
   ========================= */

describe('categories storage', () => {
  it('returns null before categories are saved', () => {
    expect(readCategories()).toBeNull();
  });

  it('reads back the categories it saved', () => {
    writeCategories([{ id: 'work', name: 'Work' }]);
    expect(readCategories()).toEqual([{ id: 'work', name: 'Work' }]);
  });

  it('ignores unreadable data', () => {
    localStorage.setItem('strata-categories-v1', '{broken');
    expect(readCategories()).toBeNull();
  });
});


/* =========================
   Emoji Check (shared)
   ========================= */

describe('isEmoji', () => {
  it('accepts emoji, including joined ones, and rejects plain text', () => {
    expect(isEmoji('📝')).toBe(true);
    expect(isEmoji('🧑‍💻')).toBe(true);
    expect(isEmoji('✌️')).toBe(true);
    expect(isEmoji('layers')).toBe(false);
    expect(isEmoji('')).toBe(false);
  });
});
