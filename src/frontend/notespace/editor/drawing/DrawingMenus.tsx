import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { PenSettings } from '../../../app/preferences';
import { HEX_COLOR, INK, SIZE_MAX, SIZE_MIN, clampSize, hexToHsv, hsvToHex, type Hsv } from './drawing';


/* =========================
   Drawing Toolbar Menus
   ========================= */

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


type SizeMenuProps = {
  tool: 'pen' | 'highlighter';
  settings: PenSettings;
  onChange: (size: number) => void;
};

export function SizeMenu({ tool, settings, onChange }: SizeMenuProps) {
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
export function ColorMenu({ settings, onChange }: ColorMenuProps) {
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
      <label className="drawing-hex-field">
        <span>Hex code</span>
        <input
          className={`drawing-hex ${valid ? '' : 'is-invalid'}`}
          value={typed}
          placeholder="#1f6feb"
          maxLength={7}
          spellCheck={false}
          aria-invalid={!valid}
          onChange={event => setTyped(event.target.value.trim())}
          onBlur={applyTyped}
          onKeyDown={event => {
            if (event.key === 'Enter') applyTyped();
          }}
        />
      </label>
    </div>
  );
}
