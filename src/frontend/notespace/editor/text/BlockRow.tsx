import { memo, useLayoutEffect, useRef, type DragEvent, type MouseEvent } from 'react';
import { Icon } from '../../../components/Icon';
import { usePreferences } from '../../../app/preferences';
import { blockType, type DocBlock } from './blockModel';
import { hydratePages } from './pageBlocks';
import { hydrateTables } from '../tables/tables';
import { highlightAll } from '../code/code';

type RegisterElement = (id: string, element: HTMLDivElement | null) => void;


/* =========================
   Block Content
   ========================= */

type BlockContentProps = {
  block: DocBlock;
  register: RegisterElement;
};

/* The text of one block. It is editable because the whole structured document is one editable */
/* area, which lets a selection run across blocks like in a normal document. */
/* Its HTML is written once, and again only when the block's version changes; in between, */
/* the browser owns the text so typing never re-renders it. */
const BlockContent = memo(function BlockContent({ block, register }: BlockContentProps) {
  const ref = useRef<HTMLDivElement>(null);
  const type = blockType(block.html);
  const { spellcheck } = usePreferences();

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.innerHTML = block.html;
    highlightAll(element);
    hydratePages(element);
    hydrateTables(element);
    register(block.id, element);
    return () => register(block.id, null);
  }, [block.id, block.version, register]);

  return <div ref={ref} className={`block-content block-content--${type}`} data-note-editable="" spellCheck={spellcheck} />;
}, (previous, next) => previous.block.id === next.block.id && previous.block.version === next.block.version && previous.register === next.register);


/* =========================
   Block Row
   ========================= */

type BlockRowProps = {
  block: DocBlock;
  selected: boolean;

  /* Text in this block is selected (not just the caret in it). */
  ranged: boolean;
  picked: boolean;
  dragging: boolean;
  drop: 'before' | 'after' | null;
  register: RegisterElement;
  onAdd: (id: string, position: 'above' | 'below') => void;
  onDragStart: (id: string, event: DragEvent<HTMLButtonElement>) => void;
};

/* One block with its hover controls: "+" adds a block below (Alt + click: above), the grip reorders. */
/* The controls are marked non-editable so typing and deleting can never change them. */
export function BlockRow({ block, selected, ranged, picked, dragging, drop, register, onAdd, onDragStart }: BlockRowProps) {
  const classes = ['editable-block', selected && 'is-selected', ranged && 'has-selection', picked && 'is-picked', dragging && 'is-dragging', drop && `drop-${drop}`]
    .filter(Boolean).join(' ');

  /* Keep the caret where it is when a control is pressed. */
  const keepFocus = (event: MouseEvent) => event.preventDefault();

  return (
    <div className={classes} data-block-id={block.id}>
      <div className="block-controls" role="group" aria-label="Block actions" contentEditable={false}>
        <button
          type="button"
          className="block-control block-add"
          tabIndex={-1}
          aria-label="Add a block below (Alt + click adds one above)"
          onMouseDown={keepFocus}
          onClick={event => onAdd(block.id, event.altKey ? 'above' : 'below')}
        >
          <Icon name="plus" size={15} />
        </button>
        <button
          type="button"
          className="block-control block-handle"
          tabIndex={-1}
          draggable
          aria-label="Drag to reorder block, or press Alt + Up or Down"
          onDragStart={event => onDragStart(block.id, event)}
        >
          <Icon name="grip" size={16} />
        </button>
      </div>
      <BlockContent block={block} register={register} />
    </div>
  );
}
