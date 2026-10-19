import { describe, expect, it } from 'vitest';
import { outlineDepths } from '../../../../src/frontend/notespace/editor/EditorPanels';


/* =========================
   Table of Contents
   ========================= */

describe('outline depths', () => {
  it('indents each heading under the nearest higher heading above it', () => {
    expect(outlineDepths([1, 2, 3, 3, 2, 1, 2])).toEqual([0, 1, 2, 2, 1, 0, 1]);
  });

  it('starts at the left whatever the first level is, and skipped levels add nothing', () => {
    expect(outlineDepths([2, 3, 2])).toEqual([0, 1, 0]);
    expect(outlineDepths([2, 4, 6, 3])).toEqual([0, 1, 2, 1]);
  });

  it('keeps a lone deep heading at the left', () => {
    expect(outlineDepths([4, 4, 1, 4])).toEqual([0, 0, 0, 1]);
  });
});
