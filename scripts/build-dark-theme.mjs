/* =========================
   Dark Theme Generator
   ========================= */

/* Builds src/frontend/app/dark-theme.css from the light stylesheets. Run it with: npm run theme */
/* Every rule that sets a colour is copied under [data-theme="dark"] with the colour converted: */
/* light backgrounds become dark, dark text becomes light, and strong accent colours stay the same. */
/* Hand-made adjustments belong in src/frontend/app/dark-overrides.css, which loads after this file. */
import { readFileSync, writeFileSync } from 'node:fs';

/* The light stylesheets, in the order src/frontend/main.tsx loads them (so later rules still win), */
/* leaving out the dark theme itself. Adding a stylesheet to main.tsx is enough to include it. */
const ENTRY = 'src/frontend/main.tsx';
const SOURCES = [...readFileSync(ENTRY, 'utf8').matchAll(/^import '\.\/(.+\.css)';$/gm)]
  .map(match => `src/frontend/${match[1]}`)
  .filter(path => !/dark-(theme|overrides)\.css$/.test(path));
const OUTPUT = 'src/frontend/app/dark-theme.css';
const PREFIX = '[data-theme="dark"]';

const COLOR = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|\bwhite\b|\bblack\b/gi;
const SHADOW_PROPERTIES = new Set(['box-shadow', 'text-shadow']);


/* =========================
   Colour Conversion
   ========================= */

function parseColor(text) {
  const value = text.toLowerCase();
  if (value === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (value === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  if (value.startsWith('#')) {
    let hex = value.slice(1);
    if (hex.length <= 4) hex = [...hex].map(digit => digit + digit).join('');
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
    };
  }
  const parts = value.replace(/rgba?\(|\)/g, '').split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
}

function toHsl({ r, g, b }) {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: lightness * 100 };
  const difference = max - min;
  const saturation = lightness > 0.5 ? difference / (2 - max - min) : difference / (max + min);
  let hue = max === red ? (green - blue) / difference + (green < blue ? 6 : 0) : max === green ? (blue - red) / difference + 2 : (red - green) / difference + 4;
  hue *= 60;
  return { h: hue, s: saturation * 100, l: lightness * 100 };
}

function format({ h, s, l }, alpha) {
  const hsl = `${Math.round(h)} ${Math.round(s)}% ${Math.round(Math.max(0, Math.min(100, l)))}%`;
  return alpha < 1 ? `hsl(${hsl} / ${Number(alpha.toFixed(3))})` : `hsl(${hsl})`;
}

/* Strong accent colours (buttons, badges, the brand blue) keep their look in both themes. */
function isAccent({ s, l }) {
  return s > 35 && l >= 35 && l <= 72;
}

/* Text: dark text becomes light; very light text (such as white on a blue button) is kept. */
/* Greyish text loses most of its blue tint, so the dark theme reads as neutral black and grey. */
function convertText(hsl) {
  const { l } = hsl;
  if (l > 88) return hsl;
  const s = hsl.s < 60 ? hsl.s * 0.3 : hsl.s;
  if (l < 55) return { ...hsl, s, l: 100 - l * 0.8 };
  if (l < 70) return { ...hsl, s, l: 56.8 - (l - 55) * 0.9 };
  return { ...hsl, s, l: 44 - (l - 70) * 0.6 };
}

/* How bright a colour looks (WCAG relative luminance), from its hue, saturation and lightness. */
function luminance({ h, s, l }) {
  const sat = s / 100;
  const light = l / 100;
  const channel = n => {
    const k = (n + h / 30) % 12;
    const value = light - sat * Math.min(light, 1 - light) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(8) + 0.0722 * channel(4);
}

/* Text is lightened until it is easy to read on the dark surfaces (a contrast of at least 4.5:1, */
/* the accessibility guideline for text). */
const SURFACE = { h: 0, s: 0, l: 10 };
const READABLE = 4.5;

function readable(hsl) {
  let color = hsl;
  while (color.l < 100 && (luminance(color) + 0.05) / (luminance(SURFACE) + 0.05) < READABLE) color = { ...color, l: color.l + 1 };
  return color;
}

/* Backgrounds, like the dark mode of most apps: the page is near-black, white surfaces (cards, */
/* notes) are dark grey, and pale highlights (selected or hovered items) are a little lighter still. */
/* Grey colours become neutral grey; clearly coloured tints keep a hint of their colour. */
const PAGE = { h: 0, s: 0, l: 6 };

function convertBackground(hsl, isWhite, neutral) {
  if (isAccent(hsl) || hsl.l < 50) return hsl;
  if (isWhite) return { h: 0, s: 0, l: 10 };
  return { h: hsl.h, s: neutral ? 0 : 22, l: Math.min(30, 10 + (100 - hsl.l) * 0.9) };
}

function convertBorder(hsl, neutral) {
  if (isAccent(hsl) || hsl.l < 50) return hsl;
  return { h: hsl.h, s: neutral ? 0 : 20, l: 15 + (100 - hsl.l) * 0.6 };
}

/* A colour counts as grey when its red, green and blue values are close together. */
/* (Saturation alone is misleading for very pale colours, which can be "saturated" yet look white.) */
function isNeutral({ r, g, b }) {
  return Math.max(r, g, b) - Math.min(r, g, b) < 24;
}

/* Shadows become darker and a little stronger, since light shadows vanish on a dark page. */
function convertShadow(color) {
  return `rgba(0, 0, 0, ${Math.min(0.55, Number((color.a * 3).toFixed(3)))})`;
}

/* Pick the conversion from the property, or from the variable's name for custom properties. */
function kindOf(property) {
  if (SHADOW_PROPERTIES.has(property) || property === '--shadow') return 'shadow';
  if (/border|outline|--line/.test(property)) return 'border';
  if (/^(color|caret-color|fill|stroke|text-decoration-color|accent-color)$|--ink|--muted|--dark-blue/.test(property)) return 'text';
  return 'background';
}

function convertValue(property, value) {
  if (property === '--bg') return format(PAGE, 1);
  const kind = kindOf(property);
  return value.replace(COLOR, match => {
    const color = parseColor(match);
    if (kind === 'shadow') return convertShadow(color);
    const hsl = toHsl(color);
    const isWhite = color.r === 255 && color.g === 255 && color.b === 255;
    const neutral = isNeutral(color);
    const converted = kind === 'text' ? convertText(hsl) : kind === 'border' ? convertBorder(hsl, neutral) : convertBackground(hsl, isWhite, neutral);
    if (property === 'color') return format(readable(converted), color.a);
    return format(converted, color.a);
  });
}


/* =========================
   Reading and Writing CSS
   ========================= */

/* Put the dark-theme attribute in front of each selector. :root and html carry it themselves. */
function prefixSelector(selector) {
  return selector.split(',').map(part => {
    const trimmed = part.trim();
    if (trimmed.startsWith(':root')) return trimmed.replace(':root', `:root${PREFIX}`);
    if (/^html\b/.test(trimmed)) return trimmed.replace(/^html/, `html${PREFIX}`);
    return `${PREFIX} ${trimmed}`;
  }).join(',\n');
}

/* Return only the colour declarations of a rule, converted; null when the rule sets no colours. */
function convertRule(selector, body) {
  const declarations = body.split(';').map(item => item.trim()).filter(Boolean).flatMap(item => {
    const index = item.indexOf(':');
    if (index < 0) return [];
    const property = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    COLOR.lastIndex = 0;
    if (!COLOR.test(value)) return [];

    /* Border and outline shorthands only change their colour. Repeating the whole shorthand */
    /* would also reset widths, undoing rules such as "border-right: 0" that shape the sticky brackets. */
    if (/^(border(-top|-right|-bottom|-left)?|outline)$/.test(property)) {
      const color = value.match(COLOR)?.[0] ?? '';
      return [`  ${property}-color: ${convertValue(property, color)};`];
    }
    return [`  ${property}: ${convertValue(property, value)};`];
  });
  if (!declarations.length) return null;
  return `${prefixSelector(selector)} {\n${declarations.join('\n')}\n}`;
}

/* A small reader for plain CSS: rules, comments and @media blocks (keyframes are skipped). */
function convertCss(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const output = [];
  let index = 0;

  while (index < source.length) {
    const open = source.indexOf('{', index);
    if (open < 0) break;
    const prelude = source.slice(index, open).trim();

    /* Find the matching closing brace, counting nested blocks. */
    let depth = 1;
    let close = open + 1;
    while (close < source.length && depth > 0) {
      if (source[close] === '{') depth += 1;
      if (source[close] === '}') depth -= 1;
      close += 1;
    }
    const body = source.slice(open + 1, close - 1);
    index = close;

    if (prelude.startsWith('@media')) {
      const inner = convertCss(body);
      if (inner.trim()) output.push(`${prelude} {\n${inner.split('\n').map(line => (line ? `  ${line}` : line)).join('\n')}\n}`);
    } else if (!prelude.startsWith('@')) {
      const rule = convertRule(prelude, body);
      if (rule) output.push(rule);
    }
  }
  return output.join('\n\n');
}

const sections = SOURCES.map(file => {
  const converted = convertCss(readFileSync(file, 'utf8'));
  return `/* =========================\n   From ${file}\n   ========================= */\n\n${converted}`;
});

const header = `/* Generated by scripts/build-dark-theme.mjs from the light stylesheets. Do not edit by hand: */
/* change the light styles or src/frontend/app/dark-overrides.css, then run: npm run theme */
:root${PREFIX} {
  color-scheme: dark;
}`;

writeFileSync(OUTPUT, `${header}\n\n\n${sections.join('\n\n\n')}\n`);
console.log(`Wrote ${OUTPUT}`);
