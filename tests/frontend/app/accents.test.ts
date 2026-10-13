import { describe, expect, it } from 'vitest';
import { ACCENTS } from '../../../src/frontend/app/preferences';
import css from '../../../src/frontend/app/accents.css?raw';

/* Each accent's colours, read from the stylesheet the app uses. */
const blocks = new Map(
  [...css.matchAll(/\.accent-swatch\[data-accent="(\w+)"\] \{([^}]*)\}/g)].map(([, name, body]) => [
    name,
    Object.fromEntries([...body.matchAll(/--([\w-]+): (#[0-9a-f]{6});/g)].map(([, key, value]) => [key, value]))
  ])
);

/* WCAG contrast between two #rrggbb colours. */
function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}


/* =========================
   Accent Colours
   ========================= */

describe('accent colours', () => {
  it('has a block of colours for every accent Settings offers', () => {
    expect([...blocks.keys()].sort()).toEqual([...ACCENTS].sort());
    for (const colours of blocks.values()) {
      expect(Object.keys(colours).sort()).toEqual(['accent', 'accent-deep', 'accent-faint', 'accent-ink', 'accent-line', 'accent-soft', 'accent-text', 'accent-tint']);
    }
  });

  it('keeps button text, links and chosen items readable (4.5:1) in every accent', () => {
    for (const [name, colours] of blocks) {
      expect(contrast('#ffffff', colours.accent), `${name}: white on the accent`).toBeGreaterThanOrEqual(4.5);
      expect(contrast('#ffffff', colours['accent-deep']), `${name}: white on the pressed accent`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colours['accent-text'], '#ffffff'), `${name}: accent text on white`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colours['accent-text'], colours['accent-soft']), `${name}: accent text on the soft tint`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colours['accent-ink'], colours['accent-tint']), `${name}: selected text`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
