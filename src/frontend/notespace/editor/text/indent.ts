import { elementOf } from '../../../lib/nodes';

/* Text indentation is kept as a small level rather than an arbitrary CSS value. */
export const MAX_INDENT = 4;

export function indentLineAt(node: Node, root: Element) {
  const element = elementOf(node);
  if (element?.closest('td, th, [contenteditable="false"]')) return null;
  const line = element?.closest<HTMLElement>('li, p, h1, h2, h3, h4, h5, h6, pre');
  return line && root.contains(line) ? line : null;
}

export function lineIndent(line: Element) {
  const value = Number(line.getAttribute('data-indent'));
  return Number.isInteger(value) && value >= 1 && value <= MAX_INDENT ? value : 0;
}

/* Lists have their own nesting rules; this changes the position of one text block. */
export function changeLineIndent(line: HTMLElement, out: boolean) {
  const before = lineIndent(line);
  const after = Math.max(0, Math.min(MAX_INDENT, before + (out ? -1 : 1)));
  if (before === after) return false;
  if (after) line.setAttribute('data-indent', String(after));
  else line.removeAttribute('data-indent');
  return true;
}
