import { describe, expect, it } from 'vitest';
import { quickNoteParts } from '../../../src/frontend/home/quickNote';


/* =========================
   Quick Note
   ========================= */

describe('quick note', () => {
  it('uses the first line as the title and the rest as paragraphs', () => {
    expect(quickNoteParts('Groceries\nMilk\nEggs')).toEqual({ title: 'Groceries', content: '<p>Milk</p><p>Eggs</p>' });
  });

  it('makes a title-only note from one line', () => {
    expect(quickNoteParts('  Call Sam  ')).toEqual({ title: 'Call Sam', content: '' });
  });

  it('skips empty lines before the title and around the text, but keeps those in between', () => {
    expect(quickNoteParts('\n\nIdeas\n\nOne\n\nTwo\n\n')).toEqual({ title: 'Ideas', content: '<p>One</p><p><br></p><p>Two</p>' });
  });

  it('treats typed markup as text', () => {
    expect(quickNoteParts('<b>Title</b>\n<img src=x onerror=alert(1)>')?.content).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  });

  it('accepts Windows line endings', () => {
    expect(quickNoteParts('A\r\nB')).toEqual({ title: 'A', content: '<p>B</p>' });
  });

  it('cuts a long first line to the title length', () => {
    expect(quickNoteParts('x'.repeat(200))?.title).toHaveLength(160);
  });

  it('returns nothing for blank text', () => {
    expect(quickNoteParts('  \n \n')).toBeNull();
  });
});
