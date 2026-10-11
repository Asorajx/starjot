import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { updatePreferences, usePreferences, type DrawingToolName, type PenSettings } from '../../app/preferences';
import { Icon, type IconName } from '../../components/Icon';
import type { DrawingStroke } from '../../../shared/types/note';
import { HEX_COLOR, INK, SIZE_MAX, SIZE_MIN, clampSize, drawingBottom, hexToHsv, hsvToHex, simplifyPoints, strokePath, touchesStroke, type Hsv } from './drawing';
import type { EditorSession } from './session';

/* The eraser's reach around the pointer, in pixels at 100% zoom. */
const ERASER_RADIUS = 8;

const TOOLS: { name: DrawingToolName; label: string; icon: IconName }[] = [
  { name: 'pen', label: 'Pen', icon: 'pencil' },
  { name: 'highlighter', label: 'Highlighter', icon: 'highlighter' },
  { name: 'eraser', label: 'Eraser: removes whole strokes', icon: 'eraser' }
];

/* Quick sizes for each pen; the slider allows any size in between. */
const PRESET_SIZES = {
  pen: [2, 4, 8, 14],
  highlighter: [10, 18, 28, 40]
};

/* Ready-made colours. Ink is the colour of the note's text, so it stays readable in dark mode. */
const SWATCHES = [
  { color: INK, label: 'Ink' },
  { color: '#e5484d', label: 'Red' },
  { color: '#f5a524', label: 'Orange' },
  { color: '#ffd84d', label: 'Yellow' },
  { color: '#30a46c', label: 'Green' },
  { color: '#3e7bfa', label: 'Blue' },
  { color: '#8e4ec6', label: 'Purple' },
  { color: '#8b95a5', label: 'Grey' }
];

/* Where the colour wheel starts for Ink, which has no fixed colour. */
const INK_HEX = '#1c2c47';

/* The colour wheel's size in pixels. */
const WHEEL_SIZE = 176;


/* =========================
   Drawing Layer
   ========================= */

type DrawingLayerProps = {
  strokes: DrawingStroke[];

  /* The distance from the column's edges to its text (a paginated note's page margin). */
  inset: number;
  layerRef: RefObject<HTMLDivElement | null>;
};

/* Shows the note's drawing over its text. It sits in the note's column and is zoomed with it, so */
/* strokes keep their place on the text column at every zoom. It never takes the mouse; drawing */
/* mode adds a surface above it (DrawingTools). Highlighter strokes are drawn under pen strokes. */
export function DrawingLayer({ strokes, inset, layerRef }: DrawingLayerProps) {
  const paths = useMemo(() => {
    const order = strokes.map((stroke, index) => ({ stroke, index }));
    return [...order.filter(item => item.stroke.tool === 'highlighter'), ...order.filter(item => item.stroke.tool === 'pen')];
  }, [strokes]);

  /* The stroke being drawn is shown until the saved stroke replaces it. */
  useLayoutEffect(() => {
    layerRef.current?.querySelector('.drawing-live')?.removeAttribute('d');
  }, [strokes, layerRef]);

  /* The layer reaches down to the lowest stroke, so the page can scroll to strokes below the text. */
  const bottom = drawingBottom(strokes);

  return (
    <div ref={layerRef} className="drawing-layer" style={{ inset, minHeight: bottom ? bottom + 24 : undefined }} aria-hidden="true">
      <svg width="100%" height="100%">
        {paths.map(({ stroke, index }) => (
          <path
            key={index}
            data-stroke={index}
            className={`drawing-stroke is-${stroke.tool}`}
            d={strokePath(stroke.points)}
            stroke={stroke.color === INK ? 'currentColor' : stroke.color}
            strokeWidth={stroke.size}
          />
        ))}
        <path className="drawing-stroke drawing-live" />
      </svg>
    </div>
  );
}


/* =========================
   Drawing Toolbar Menus
   ========================= */

type SizeMenuProps = {
  tool: 'pen' | 'highlighter';
  settings: PenSettings;
  onChange: (size: number) => void;
};

function SizeMenu({ tool, settings, onChange }: SizeMenuProps) {
  return (
    <div className="drawing-menu" role="dialog" aria-label="Size">
      <span className="drawing-menu-heading">Size <strong>{settings.size}px</strong></span>
      <input
        type="range"
        className="drawing-slider"
        min={SIZE_MIN}
        max={SIZE_MAX}
        value={settings.size}
        aria-label="Size"
        onChange={event => onChange(clampSize(Number(event.target.value)))}
      />
      <span className="drawing-size-presets">
        {PRESET_SIZES[tool].map(size => (
          <button
            key={size}
            type="button"
            className={`drawing-size-preset ${settings.size === size ? 'selected' : ''}`}
            aria-label={`${size} pixels`}
            aria-pressed={settings.size === size}
            onClick={() => onChange(size)}
          >
            <span style={{ width: Math.min(size, 22), height: Math.min(size, 22) }} />
          </button>
        ))}
      </span>
    </div>
  );
}

type ColorWheelProps = {
  color: string;
  onChange: (color: string) => void;
};

/* A colour wheel in Starjot's own style (the browser's colour picker looks different on every */
/* system). Around the wheel is the hue, and from the centre outwards the colour gets stronger; */
/* the slider below sets the brightness. */
function ColorWheel({ color, onChange }: ColorWheelProps) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(color === INK ? INK_HEX : color));
  const wheelRef = useRef<HTMLDivElement>(null);
  const sent = useRef(color);

  /* A colour chosen elsewhere (a swatch or the hex box) moves the wheel. Colours the wheel sent */
  /* itself are skipped, so the hue is kept while the colour is grey or black. */
  useEffect(() => {
    if (color !== sent.current) setHsv(hexToHsv(color === INK ? INK_HEX : color));
    sent.current = color;
  }, [color]);

  function change(next: Hsv) {
    setHsv(next);
    sent.current = hsvToHex(next);
    onChange(sent.current);
  }

  /* The pointer's angle around the centre is the hue, and its distance from it the saturation. */
  function pick(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = wheelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    const h = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
    change({ ...hsv, h, s: Math.min(1, Math.hypot(x, y) / (rect.width / 2)) });
  }

  const radius = WHEEL_SIZE / 2;
  const angle = (hsv.h * Math.PI) / 180;
  const brightest = hsvToHex({ ...hsv, v: 1 });

  return (
    <div className="drawing-wheel-area">
      {/* The wheel's colours are set here rather than in the stylesheet, so dark mode does not change them. */}
      <div
        ref={wheelRef}
        className="drawing-wheel"
        style={{
          width: WHEEL_SIZE,
          height: WHEEL_SIZE,
          background: 'radial-gradient(closest-side, #ffffff, rgba(255, 255, 255, 0)), conic-gradient(red, yellow, lime, cyan, blue, magenta, red)'
        }}
        onPointerDown={event => {
          event.currentTarget.setPointerCapture(event.pointerId);
          pick(event);
        }}
        onPointerMove={event => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) pick(event);
        }}
      >
        <span className="drawing-wheel-shade" style={{ opacity: 1 - hsv.v, background: '#000000' }} />
        <span
          className="drawing-wheel-thumb"
          style={{ left: radius + Math.sin(angle) * hsv.s * radius, top: radius - Math.cos(angle) * hsv.s * radius, background: hsvToHex(hsv), borderColor: '#ffffff' }}
        />
      </div>
      <input
        type="range"
        className="drawing-slider"
        min={0}
        max={100}
        value={Math.round(hsv.v * 100)}
        aria-label="Brightness"
        style={{ background: `linear-gradient(to right, #000000, ${brightest})` }}
        onChange={event => change({ ...hsv, v: Number(event.target.value) / 100 })}
      />
    </div>
  );
}

type ColorMenuProps = {
  settings: PenSettings;
  onChange: (color: string) => void;
};

/* Ready-made colours, a colour wheel and a hex code box. */
function ColorMenu({ settings, onChange }: ColorMenuProps) {
  const [typed, setTyped] = useState(settings.color === INK ? '' : settings.color);
  const typedHex = `#${typed.replace(/^#/, '')}`;
  const valid = !typed || HEX_COLOR.test(typedHex);

  useEffect(() => setTyped(settings.color === INK ? '' : settings.color), [settings.color]);

  function applyTyped() {
    if (typed && HEX_COLOR.test(typedHex)) onChange(typedHex.toLowerCase());
  }

  return (
    <div className="drawing-menu" role="dialog" aria-label="Colour">
      <span className="drawing-menu-heading">Colour</span>
      <span className="drawing-swatches">
        {SWATCHES.map(swatch => (
          <button
            key={swatch.color}
            type="button"
            className={`drawing-swatch ${swatch.color === INK ? 'is-ink' : ''} ${settings.color === swatch.color ? 'selected' : ''}`}
            style={swatch.color === INK ? undefined : { background: swatch.color }}
            data-tooltip={swatch.label}
            aria-label={swatch.label}
            aria-pressed={settings.color === swatch.color}
            onClick={() => onChange(swatch.color)}
          />
        ))}
      </span>
      <ColorWheel color={settings.color} onChange={onChange} />
      <input
        className={`drawing-hex ${valid ? '' : 'is-invalid'}`}
        value={typed}
        placeholder="#hex code"
        maxLength={7}
        spellCheck={false}
        aria-label="Hex colour code"
        aria-invalid={!valid}
        onChange={event => setTyped(event.target.value.trim())}
        onBlur={applyTyped}
        onKeyDown={event => {
          if (event.key === 'Enter') applyTyped();
        }}
      />
    </div>
  );
}


/* =========================
   Drawing Tools
   ========================= */

type DrawingToolsProps = {
  session: EditorSession;
  strokes: DrawingStroke[];
  layerRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
};

type Gesture = {
  id: number;
  points: number[];

  /* Strokes the eraser has touched so far; they are removed when the eraser is lifted. */
  erased: Set<number>;
};

/* Drawing mode: a surface over the note that takes the mouse, pen or finger, and a toolbar at the */
/* side of the pane with the tools, size and colour. Each stroke (or each sweep of the eraser) is */
/* one undo step. While drawing, the note's text cannot be selected or edited. */
export function DrawingTools({ session, strokes, layerRef, onClose }: DrawingToolsProps) {
  const { drawing } = usePreferences();
  const [menu, setMenu] = useState<'size' | 'color' | null>(null);
  const [eraserAt, setEraserAt] = useState<{ x: number; y: number; scale: number } | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  const tool = drawing.tool;
  const pen = tool === 'eraser' ? null : tool;
  const settings = pen ? drawing[pen] : null;

  /* Clicking outside an open menu, or pressing Escape, closes it. Listening early (capture) lets */
  /* Escape close only the menu, not drawing mode as well. */
  useEffect(() => {
    if (!menu) return;
    function handleMouseDown(event: MouseEvent) {
      if (!(event.target as Element).closest?.('.drawing-toolbar')) setMenu(null);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setMenu(null);
    }
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [menu]);

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
    const rect = layer.getBoundingClientRect();
    const scale = rect.width / (layer.offsetWidth || rect.width) || 1;
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale, scale };
  }

  /* Show the stroke being drawn straight on the page, without waiting for React. */
  function drawLive(points: number[]) {
    const live = layerRef.current?.querySelector('.drawing-live');
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
        if (current.erased.has(index) || !touchesStroke(stroke, atX, atY, ERASER_RADIUS)) return;
        current.erased.add(index);
        layerRef.current?.querySelector(`[data-stroke="${index}"]`)?.setAttribute('data-erasing', '');
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
      layerRef.current?.querySelectorAll('[data-erasing]').forEach(path => path.removeAttribute('data-erasing'));
      if (current.erased.size) session.saveDrawing(strokesRef.current.filter((_, index) => !current.erased.has(index)));
      return;
    }
    if (!pen || !settings) return;
    session.saveDrawing([...strokesRef.current, { tool: pen, color: settings.color, size: settings.size, points: simplifyPoints(current.points) }]);
  }

  const toolButton = (item: (typeof TOOLS)[number]) => (
    <button
      key={item.name}
      type="button"
      className={`drawing-tool ${tool === item.name ? 'selected' : ''}`}
      data-tooltip={item.label}
      data-tooltip-side="left"
      aria-label={item.label}
      aria-pressed={tool === item.name}
      onClick={() => choose({ tool: item.name })}
    >
      <Icon name={item.icon} size={17} />
    </button>
  );

  return (
    <>
      <div className="drawing-dock">
        <div className="drawing-toolbar" role="toolbar" aria-label="Drawing tools" aria-orientation="vertical">
          {TOOLS.map(toolButton)}
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

          <span className="drawing-toolbar-rule" />
          <button type="button" className="drawing-tool" data-tooltip="Stop drawing (Esc)" data-tooltip-side="left" aria-label="Stop drawing" onClick={onClose}>
            <Icon name="x" size={17} />
          </button>
        </div>
      </div>

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
    </>
  );
}
