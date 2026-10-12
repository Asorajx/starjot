import { describe, expect, it } from 'vitest';
import { createDrawingBlock, createImageBlock, drawingStrokes, imageAlign, imageIdsIn, setImageAlign, setImageWidth } from '../../../../../src/frontend/notespace/editor/images/images';
import { newImageId } from '../../../../../src/frontend/notespace/imageStore';
import { cleanHtml } from '../../../../../src/frontend/notespace/sanitize';


/* =========================
   Image Blocks
   ========================= */

describe('image blocks', () => {
  it('makes an empty block holding the image id and its width', () => {
    const block = createImageBlock('img_abc_123', 320);
    expect(block.outerHTML).toBe('<span class="image-block" data-image="img_abc_123" data-width="320" style="width: 320px;"></span>');
  });

  it('keeps the width between the smallest size and the largest', () => {
    const block = createImageBlock('img_a', 320);
    expect(setImageWidth(block, 5)).toBe(32);
    expect(setImageWidth(block, 9000)).toBe(4000);
  });

  it('sits in the text unless centred or on the right', () => {
    const block = createImageBlock('img_a', 320);
    expect(imageAlign(block)).toBe('left');
    setImageAlign(block, 'right');
    expect(block.dataset.align).toBe('right');
    setImageAlign(block, 'left');
    expect(block.hasAttribute('data-align')).toBe(false);
  });

  it('makes ids the sanitizer keeps', () => {
    const id = newImageId();
    expect(cleanHtml(`<span class="image-block" data-image="${id}"></span>`)).toContain(id);
  });

  it('lists the images a note uses', () => {
    expect(imageIdsIn('<p>a<span class="image-block" data-image="img_one"></span></p><p><span class="image-block" data-image="img_two"></span></p>'))
      .toEqual(['img_one', 'img_two']);
  });
});


/* =========================
   Stored Image Markup
   ========================= */

describe('cleanHtml with images', () => {
  it('stores an image empty, keeping only its id, width, alignment and comment', () => {
    const html = '<span class="image-block is-selected" data-image="img_abc" data-width="240" data-align="center" data-comment="c1" style="width: 240px" contenteditable="false">'
      + '<img src="blob:x"><span class="image-resize"></span></span>';
    expect(cleanHtml(html)).toBe('<span class="image-block" data-image="img_abc" data-width="240" data-align="center" data-comment="c1"></span>');
  });

  it('drops ids, widths and alignments that are not allowed', () => {
    const html = '<span class="image-block" data-image="javascript:alert(1)" data-width="99999" data-align="top"></span>';
    expect(cleanHtml(html)).toBe('<span class="image-block"></span>');
  });

  it('never keeps an image tag outside an image block', () => {
    expect(cleanHtml('<p><img src="https://example.com/x.png" onerror="alert(1)">Hi</p>')).toBe('<p>Hi</p>');
  });
});


/* =========================
   Pinned Drawings
   ========================= */

describe('pinned drawings', () => {
  const strokes = [{ tool: 'pen' as const, color: 'ink', size: 3, points: [1, 2, 30.5, 40] }];

  it('keeps its strokes, its own size, its width, its side and how far it is moved', () => {
    const block = createDrawingBlock(strokes, 40, 50, 80, 'wrap-left', { x: 12, y: 6 });
    expect(block.className).toBe('image-block drawing-block');
    expect(block.dataset.align).toBe('wrap-left');
    expect(block.dataset.box).toBe('40 50');
    expect(block.dataset.offset).toBe('12 6');
    expect(drawingStrokes(block)).toEqual(strokes);
  });

  it('is stored empty, with its strokes checked and written again', () => {
    const block = createDrawingBlock(strokes, 40, 50, 80, 'right', null);
    block.innerHTML = '<svg><path d="M0 0"/></svg>';
    expect(cleanHtml(block.outerHTML)).toBe(
      '<span class="image-block drawing-block" data-width="80" data-align="right" data-drawing="p,ink,3:1 2 30.5 40" data-box="40 50"></span>'
    );
  });

  it('keeps a drawing in front of the text, with an offset that may be negative', () => {
    const html = '<span class="image-block drawing-block" data-drawing="p,ink,3:1 2" data-box="40 50" data-offset="-12 -6" data-wrap="front"></span>';
    expect(cleanHtml(html)).toBe('<span class="image-block drawing-block" data-drawing="p,ink,3:1 2" data-box="40 50" data-offset="-12 -6" data-wrap="front"></span>');
  });

  it('drops broken strokes, sizes and offsets', () => {
    const html = '<span class="image-block drawing-block" data-drawing="p,url(x),3:1 2;h,#ffd84d,9:a b" data-box="-4 9" data-offset="5"></span>';
    expect(cleanHtml(html)).toBe('<span class="image-block drawing-block" data-drawing="p,ink,3:1 2"></span>');
  });
});
