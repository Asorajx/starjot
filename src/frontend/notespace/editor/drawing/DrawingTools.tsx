import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { updatePreferences, usePreferences, type DrawingToolName, type PenSettings } from '../../../app/preferences';
import { Icon, type IconName } from '../../../components/Icon';
import type { DrawingLayerInfo, DrawingStroke } from '../../../../shared/types/note';
import { LayersMenu } from './LayersMenu';
import { DrawingSelection } from './DrawingSelection';
import { INK, simplifyPoints, strokeLayer, strokePath, touchesStroke } from './drawing';
import type { EditorSession } from '../session';
import { zoomed } from '../../../lib/geometry';
import { useDismiss } from '../../../lib/useDismiss';
import { isBelowText, livePath, strokeElements } from './DrawingLayer';
import { ColorMenu, SizeMenu } from './DrawingMenus';


/* =========================
   Drawing Tools
   ========================= */

/* The eraser's reach around the pointer, in pixels at 100% zoom. */
const ERASER_RADIUS = 8;

/* The canvas's own tools, kept by the canvas rather than in the drawing settings, since */
/* documents have neither. */
export type CanvasTool = 'hand' | 'text';

type ToolButton = { name: DrawingToolName | CanvasTool; label: string; icon: IconName };

const TOOLS: ToolButton[] = [
  { name: 'pen', label: 'Pen', icon: 'pencil' },
  { name: 'highlighter', label: 'Highlighter', icon: 'highlighter' },
  { name: 'eraser', label: 'Eraser: removes whole strokes', icon: 'eraser' },
  { name: 'select', label: 'Select: anchor strokes into the text', icon: 'box-select' }
];

/* A canvas has no text to anchor into: Select moves strokes and text boxes instead, the Hand */
/* moves around, and Text adds text boxes. */
const CANVAS_TOOLS: ToolButton[] = [
  { name: 'hand', label: 'Hand: drag to move around', icon: 'hand' },
  ...TOOLS.slice(0, 3),
  { name: 'select', label: 'Select: move or delete strokes and text', icon: 'box-select' },
  { name: 'text', label: 'Text: click to add a text box', icon: 'type' }
];


type DrawingToolsProps = {
  session: EditorSession;
  strokes: DrawingStroke[];
  layers: DrawingLayerInfo[];

  /* The layer being drawn on: new strokes go onto it, and the eraser and Select only touch it. */
  activeLayer: string;
  onActiveLayerChange: (id: string) => void;
  layerRef: RefObject<HTMLDivElement | null>;

  /* Leaves drawing mode; a canvas, which is always drawn on, has none. */
  onClose?: () => void;

  /* On a canvas: its own tool when one is chosen (the canvas does what it does), or null for a */
  /* drawing tool. */
  canvas?: { tool: CanvasTool | null; onToolChange: (tool: CanvasTool | null) => void };

  /* Opens Settings at the drawing settings. */
  onOpenSettings: () => void;
};

type Gesture = {
  id: number;
  points: number[];

  /* Strokes the eraser has touched so far; they are removed when the eraser is lifted. */
  erased: Set<number>;
};

/* Drawing mode: a surface over the note that takes the mouse, pen or finger, and a toolbar at the */
/* side of the pane with the tools, size and colour. The Select tool has its own surface */
/* (DrawingSelection), for anchoring strokes into the text, or moving them on a canvas. Each */
/* stroke (or each sweep of the eraser) is one undo step. While drawing, the note's text cannot be */
/* selected or edited. */
export function DrawingTools({ session, strokes, layers, activeLayer, onActiveLayerChange, layerRef, onClose, canvas, onOpenSettings }: DrawingToolsProps) {
  const { drawing } = usePreferences();
  const [menu, setMenu] = useState<'size' | 'color' | 'layers' | null>(null);
  const [eraserAt, setEraserAt] = useState<{ x: number; y: number; scale: number } | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  /* Only strokes on the layer being drawn on can be erased or selected (none while it is hidden). */
  const active = layers.find(layer => layer.id === activeLayer);
  const onActiveLayer = (stroke: DrawingStroke) => Boolean(active && !active.hidden) && strokeLayer(stroke, layers) === activeLayer;

  const tool = drawing.tool;
  const pen = tool === 'pen' || tool === 'highlighter' ? tool : null;
  const settings = pen ? drawing[pen] : null;

  /* Clicking outside an open menu, or pressing Escape, closes it (Escape without also leaving */
  /* drawing mode). */
  useDismiss(Boolean(menu), '.drawing-toolbar', () => setMenu(null));

  function choose(changes: Partial<typeof drawing>) {
    updatePreferences({ drawing: { ...drawing, ...changes } });
  }

  function changePen(changes: Partial<PenSettings>) {
    if (pen && settings) choose({ [pen]: { ...settings, ...changes } });
  }

  /* The pointer's place on the drawing layer, in pixels at 100% zoom, and the zoom itself. */
  function position(event: { clientX: number; clientY: number }) {
    const layer = layerRef.current;
    if (!layer) return null;
    const { rect, scale } = zoomed(layer);
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale, scale };
  }

  /* Show the stroke being drawn straight on the page, without waiting for React. */
  function drawLive(points: number[]) {
    const live = layerRef.current && livePath(layerRef.current, isBelowText(layers, activeLayer));
    if (!live || !pen || !settings) return;
    live.setAttribute('d', strokePath(points));
    live.setAttribute('class', `drawing-stroke drawing-live is-${pen}`);
    live.setAttribute('stroke', settings.color === INK ? 'currentColor' : settings.color);
    live.setAttribute('stroke-width', String(settings.size));
  }

  /* Mark the strokes the eraser touches between its last place and this one. Fast movements are */
  /* checked in small steps, so the eraser does not jump over thin strokes. */
  function erase(current: Gesture, x: number, y: number) {
    const [lastX, lastY] = current.points.length ? current.points.slice(-2) : [x, y];
    const steps = Math.max(1, Math.ceil(Math.hypot(x - lastX, y - lastY) / (ERASER_RADIUS / 2)));
    for (let step = 1; step <= steps; step++) {
      const atX = lastX + ((x - lastX) * step) / steps;
      const atY = lastY + ((y - lastY) * step) / steps;
      strokesRef.current.forEach((stroke, index) => {
        if (current.erased.has(index) || !onActiveLayer(stroke) || !touchesStroke(stroke, atX, atY, ERASER_RADIUS)) return;
        current.erased.add(index);
        const layer = layerRef.current;
        if (layer) strokeElements(layer, `[data-stroke="${index}"]`)[0]?.setAttribute('data-erasing', '');
      });
    }
    current.points.push(x, y);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const at = position(event);
    if (!at) return;
    event.preventDefault();
    setMenu(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    const current: Gesture = { id: event.pointerId, points: [], erased: new Set() };
    gesture.current = current;
    if (tool === 'eraser') erase(current, at.x, at.y);
    else {
      current.points.push(at.x, at.y);
      drawLive(current.points);
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const surface = surfaceRef.current?.getBoundingClientRect();
    const at = position(event);
    if (tool === 'eraser' && surface && at) setEraserAt({ x: event.clientX - surface.left, y: event.clientY - surface.top, scale: at.scale });

    const current = gesture.current;
    if (!current || event.pointerId !== current.id) return;

    /* A fast pen or mouse sends several positions between two move events; all of them are used. */
    const native = event.nativeEvent;
    const events = native.getCoalescedEvents?.().length ? native.getCoalescedEvents() : [native];
    for (const item of events) {
      const point = position(item);
      if (!point) continue;
      if (tool === 'eraser') erase(current, point.x, point.y);
      else if (Math.hypot(point.x - current.points[current.points.length - 2], point.y - current.points[current.points.length - 1]) >= 0.5) {
        current.points.push(point.x, point.y);
      }
    }
    if (tool !== 'eraser') drawLive(current.points);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || event.pointerId !== current.id) return;
    gesture.current = null;

    if (tool === 'eraser') {
      const layer = layerRef.current;
      if (layer) strokeElements(layer, '[data-erasing]').forEach(path => path.removeAttribute('data-erasing'));
      if (current.erased.size) session.saveDrawing(strokesRef.current.filter((_, index) => !current.erased.has(index)));
      return;
    }
    if (!pen || !settings) return;

    /* Drawing on a hidden layer shows it again, so the new stroke can be seen. */
    const stroke = { tool: pen, color: settings.color, size: settings.size, points: simplifyPoints(current.points), layer: activeLayer };
    const shown = active?.hidden ? layers.map(layer => (layer.id === activeLayer ? { ...layer, hidden: false } : layer)) : undefined;
    session.saveDrawing([...strokesRef.current, stroke], shown);
  }

  const canvasTool = canvas?.tool ?? null;
  const toolButton = (item: ToolButton) => {
    const own = item.name === 'hand' || item.name === 'text';
    const chosen = own ? canvasTool === item.name : !canvasTool && tool === item.name;
    return (
      <button
        key={item.name}
        type="button"
        className={`drawing-tool ${chosen ? 'selected' : ''}`}
        data-tooltip={item.label}
        data-tooltip-side="left"
        aria-label={item.label}
        aria-pressed={chosen}
        onClick={() => {
          if (item.name === 'hand' || item.name === 'text') {
            canvas?.onToolChange(item.name);
            return;
          }
          canvas?.onToolChange(null);
          choose({ tool: item.name });
        }}
      >
        <Icon name={item.icon} size={17} />
      </button>
    );
  };

  return (
    <>
      <div className="drawing-dock">
        <div className="drawing-toolbar" role="toolbar" aria-label="Drawing tools" aria-orientation="vertical">
          {(canvas ? CANVAS_TOOLS : TOOLS).map(toolButton)}
          <span className="drawing-toolbar-rule" />

          <span className="drawing-menu-anchor">
            <button
              type="button"
              className={`drawing-tool ${menu === 'size' ? 'selected' : ''}`}
              data-tooltip={menu === 'size' ? undefined : `Size: ${settings?.size ?? 0}px`}
              data-tooltip-side="left"
              aria-label="Size"
              aria-expanded={menu === 'size'}
              disabled={!settings}
              onClick={() => setMenu(open => (open === 'size' ? null : 'size'))}
            >
              <Icon name="line-weight" size={17} />
            </button>
            {menu === 'size' && pen && settings && <SizeMenu tool={pen} settings={settings} onChange={size => changePen({ size })} />}
          </span>

          <span className="drawing-menu-anchor">
            <button
              type="button"
              className={`drawing-tool ${menu === 'color' ? 'selected' : ''}`}
              data-tooltip={menu === 'color' ? undefined : 'Colour'}
              data-tooltip-side="left"
              aria-label="Colour"
              aria-expanded={menu === 'color'}
              disabled={!settings}
              onClick={() => setMenu(open => (open === 'color' ? null : 'color'))}
            >
              <span
                className={`drawing-color-dot ${settings?.color === INK ? 'is-ink' : ''}`}
                style={settings && settings.color !== INK ? { background: settings.color } : undefined}
              />
            </button>
            {menu === 'color' && settings && <ColorMenu settings={settings} onChange={color => changePen({ color })} />}
          </span>

          <span className="drawing-menu-anchor">
            <button
              type="button"
              className={`drawing-tool ${menu === 'layers' ? 'selected' : ''}`}
              data-tooltip={menu === 'layers' ? undefined : `Layers: ${active?.name ?? ''}`}
              data-tooltip-side="left"
              aria-label="Layers"
              aria-expanded={menu === 'layers'}
              onClick={() => setMenu(open => (open === 'layers' ? null : 'layers'))}
            >
              <Icon name="layers" size={17} />
            </button>
            {menu === 'layers' && <LayersMenu session={session} strokes={strokes} layers={layers} active={activeLayer} onActivate={onActiveLayerChange} />}
          </span>

          <span className="drawing-toolbar-rule" />
          <button type="button" className="drawing-tool" data-tooltip="Drawing settings" data-tooltip-side="left" aria-label="Drawing settings" onClick={onOpenSettings}>
            <Icon name="settings" size={17} />
          </button>
          {onClose && (
            <button type="button" className="drawing-tool" data-tooltip="Stop drawing" data-shortcut="Esc" data-tooltip-side="left" aria-label="Stop drawing" onClick={onClose}>
              <Icon name="x" size={17} />
            </button>
          )}
        </div>
      </div>

      {canvasTool ? null : tool === 'select' ? (
        <DrawingSelection
          session={session}
          strokes={strokes}
          layerRef={layerRef}
          edge={drawing.selectEdge}
          snap={drawing.snap}
          wrap={drawing.anchorWrap}
          onWrapChange={anchorWrap => choose({ anchorWrap })}
          layer={activeLayer}
          allowed={onActiveLayer}
          canvas={Boolean(canvas)}
        />
      ) : (
        <div
          ref={surfaceRef}
          className={`drawing-surface is-${tool}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={() => setEraserAt(null)}
        >
          {tool === 'eraser' && eraserAt && (
            <span
              className="drawing-eraser"
              style={{ left: eraserAt.x, top: eraserAt.y, width: ERASER_RADIUS * 2 * eraserAt.scale, height: ERASER_RADIUS * 2 * eraserAt.scale }}
            />
          )}
        </div>
      )}
    </>
  );
}
