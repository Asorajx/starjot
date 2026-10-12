import { useLayoutEffect, useMemo, type RefObject } from 'react';
import type { DrawingLayerInfo, DrawingStroke } from '../../../../shared/types/note';
import { INK, TEXT_LAYER, drawingBottom, inDrawingOrder, strokeLayer, strokePath, visibleLayers } from './drawing';


/* =========================
   Drawing Layer
   ========================= */

type DrawingLayerProps = {
  strokes: DrawingStroke[];
  layers: DrawingLayerInfo[];

  /* The distance from the column's edges to its text (a paginated note's page margin). */
  inset: number;
  layerRef: RefObject<HTMLDivElement | null>;
};

type PlacedStroke = { stroke: DrawingStroke; index: number };

/* Stroke paths in both halves of the drawing (under and over the text), found from either one. */
export function strokeElements(layer: HTMLElement, selector: string) {
  return Array.from(layer.parentElement?.querySelectorAll(`.drawing-layer ${selector}`) ?? []);
}

/* The path that shows the stroke being drawn, in the half of the drawing its layer is in. */
export function livePath(layer: HTMLElement, belowText: boolean) {
  return layer.parentElement?.querySelector(`.drawing-layer${belowText ? '.is-below' : ':not(.is-below)'} .drawing-live`) ?? null;
}

/* Whether a layer is under the note's text. */
export function isBelowText(layers: DrawingLayerInfo[], id: string) {
  return layers.findIndex(layer => layer.id === id) < layers.findIndex(layer => layer.id === TEXT_LAYER);
}

function StrokePaths({ items }: { items: PlacedStroke[] }) {
  return (
    <>
      {items.map(({ stroke, index }) => (
        <path
          key={index}
          data-stroke={index}
          className={`drawing-stroke is-${stroke.tool}`}
          d={strokePath(stroke.points)}
          stroke={stroke.color === INK ? 'currentColor' : stroke.color}
          strokeWidth={stroke.size}
        />
      ))}
    </>
  );
}

/* Shows the note's drawing in two halves: the layers under the text and the layers over it. Both */
/* sit in the note's column and are zoomed with it, so strokes keep their place on the text column */
/* at every zoom. They never take the mouse; drawing mode adds a surface above them (DrawingTools). */
/* Layers are drawn in order, and within a layer highlighter strokes go under pen strokes. Hidden */
/* layers are left out. */
export function DrawingLayer({ strokes, layers, inset, layerRef }: DrawingLayerProps) {
  const { below, above } = useMemo(() => {
    const byLayer = new Map<string, PlacedStroke[]>();
    strokes.forEach((stroke, index) => {
      const id = strokeLayer(stroke, layers);
      const list = byLayer.get(id);
      if (list) list.push({ stroke, index });
      else byLayer.set(id, [{ stroke, index }]);
    });
    const half = (below: boolean) => visibleLayers(layers, below).flatMap(layer => inDrawingOrder(byLayer.get(layer.id) ?? [], item => item.stroke));
    return { below: half(true), above: half(false) };
  }, [strokes, layers]);

  /* The stroke being drawn is shown until the saved stroke replaces it. */
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (layer) strokeElements(layer, '.drawing-live').forEach(path => path.removeAttribute('d'));
  }, [strokes, layerRef]);

  /* The layers reach down to the lowest stroke, so the page can scroll to strokes below the text. */
  const bottom = drawingBottom(strokes);
  const style = { inset, minHeight: bottom ? bottom + 24 : undefined };

  return (
    <>
      <div className="drawing-layer is-below" style={style} aria-hidden="true">
        <svg width="100%" height="100%">
          <StrokePaths items={below} />
          <path className="drawing-stroke drawing-live" />
        </svg>
      </div>
      <div ref={layerRef} className="drawing-layer" style={style} aria-hidden="true">
        <svg width="100%" height="100%">
          <StrokePaths items={above} />
          <path className="drawing-stroke drawing-live" />
        </svg>
      </div>
    </>
  );
}
