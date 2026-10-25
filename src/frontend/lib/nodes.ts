/* The element a node is, or the element it sits in (a text node's parent), or null. */
export function elementOf(node: Node | null | undefined): Element | null {
  return node instanceof Element ? node : node?.parentElement ?? null;
}
