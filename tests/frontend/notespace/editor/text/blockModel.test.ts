import { describe, expect, it } from 'vitest';
import {
  groupForNewBlock, makeBlock, normalizeGroups, parseBlocks, serializeBlocks, stickBlocks, stickyStateFor, unstickGroup
} from '../../../../../src/frontend/notespace/editor/text/blockModel';


/* =========================
   Blocks and HTML
   ========================= */

describe('parseBlocks and serializeBlocks', () => {
  it('turns each line of a document into one block', () => {
    const blocks = parseBlocks('<h2>Title</h2><p>First</p><ul><li>Item</li></ul>');
    expect(blocks.map(block => block.html)).toEqual(['<h2>Title</h2>', '<p>First</p>', '<ul><li>Item</li></ul>']);
  });

  it('keeps text joined by line breaks in one paragraph block', () => {
    const blocks = parseBlocks('line one<br>line two');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].html).toBe('<p>line one<br>line two</p>');
  });

  it('keeps sticky groups when converting back to HTML', () => {
    const html = '<p>Before</p><div class="sticky-group"><h2>A</h2><p>B</p></div><p>After</p>';
    expect(serializeBlocks(parseBlocks(html))).toBe(html);
  });

  it('always returns at least one empty block', () => {
    expect(parseBlocks('')).toHaveLength(1);
  });
});


/* =========================
   Sticky Groups
   ========================= */

describe('sticky groups', () => {
  const three = () => [makeBlock('<p>1</p>'), makeBlock('<p>2</p>'), makeBlock('<p>3</p>')];

  it('sticks the selected blocks together and offers to unstick them', () => {
    const blocks = three();
    const stuck = stickBlocks(blocks, [blocks[0].id, blocks[1].id]);
    expect(stuck[0].group).not.toBeNull();
    expect(stuck[0].group).toBe(stuck[1].group);
    expect(stuck[2].group).toBeNull();
    expect(stickyStateFor(stuck, [stuck[0].id])).toBe('unstick');
  });

  it('merges groups when a selection covers more than one group', () => {
    const blocks = three();
    let stuck = stickBlocks(blocks, [blocks[0].id]);
    stuck = stickBlocks(stuck, [stuck[2].id]);
    expect(stickyStateFor(stuck, [stuck[0].id, stuck[2].id])).toBe('stick');
    const merged = stickBlocks(stuck, [stuck[0].id, stuck[2].id]);
    expect(new Set(merged.map(block => block.group)).size).toBe(1);
  });

  it('unsticks every block of a group', () => {
    const blocks = three();
    const stuck = stickBlocks(blocks, blocks.map(block => block.id));
    expect(unstickGroup(stuck, stuck[0].group as string).every(block => block.group === null)).toBe(true);
  });

  it('does not add new lines at the edges of a group to the group', () => {
    const blocks = three();
    const stuck = stickBlocks(blocks, [blocks[0].id, blocks[1].id]);
    expect(groupForNewBlock(stuck, 1, 'below')).toBeNull();
    expect(groupForNewBlock(stuck, 0, 'above')).toBeNull();
    expect(groupForNewBlock(stuck, 0, 'below')).toBe(stuck[0].group);
  });

  it('gives a group that was split apart a new id for its later part', () => {
    const a = makeBlock('<p>a</p>', 'g1');
    const b = makeBlock('<p>b</p>');
    const c = makeBlock('<p>c</p>', 'g1');
    const normalized = normalizeGroups([a, b, c]);
    expect(normalized[0].group).toBe('g1');
    expect(normalized[2].group).not.toBe('g1');
  });
});
