import { LINE_TAGS } from './dom';
import type { StickyState } from './blockModel';


/* =========================
   Sticky Groups in Continuous Notes
   ========================= */

/* A sticky group is stored as <div class="sticky-group"> around the content it keeps together. */
/* Printing uses break-inside: avoid on that wrapper, so the group moves to the next page as one. */
/* A piece is one line, or a run of inline text, and the group it sits in. */
type Piece = {
  nodes: Node[];
  group: HTMLElement | null;
};

/* Split a document into pieces: one per line element, and one per run of inline text. */
function pieces(container: Node, group: HTMLElement | null = null): Piece[] {
  const list: Piece[] = [];
  let inline: Piece | null = null;

  container.childNodes.forEach(node => {
    if (node instanceof HTMLElement && node.classList.contains('sticky-group')) {
      inline = null;
      list.push(...pieces(node, group ?? node));
    } else if (node instanceof Element && LINE_TAGS.has(node.tagName)) {
      inline = null;
      list.push({ nodes: [node], group });
    } else if (node instanceof Element || node.nodeType === Node.TEXT_NODE) {
      /* Loose whitespace between lines is not content worth selecting. */
      if (!inline && node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) return;
      if (!inline) {
        inline = { nodes: [], group };
        list.push(inline);
      }
      inline.nodes.push(node);
    }
  });
  return list;
}

function selectedPieces(body: Element, range: Range | null) {
  if (!range || !body.contains(range.startContainer)) return [];
  return pieces(body).filter(piece => piece.nodes.some(node => range.intersectsNode(node)));
}

export function stickyStateForRange(body: Element, range: Range | null): StickyState {
  const targets = selectedPieces(body, range);
  if (!targets.length) return 'none';
  const group = targets[0].group;
  return group && targets.every(target => target.group === group) ? 'unstick' : 'stick';
}

/* Stick or unstick the selected content. Returns true when the document changed. */
export function toggleStickyRange(body: Element, range: Range | null) {
  const targets = selectedPieces(body, range);
  const state = stickyStateForRange(body, range);
  if (state === 'none') return false;

  if (state === 'unstick') {
    const group = targets[0].group as HTMLElement;
    group.replaceWith(...Array.from(group.childNodes));
    return true;
  }

  /* Wrap everything from the first to the last target, merging any groups inside the range. */
  const topLevel = targets.flatMap(target => (target.group ? [target.group] : target.nodes));
  topLevel.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  const first = topLevel[0] as ChildNode;
  const last = topLevel[topLevel.length - 1];

  const wrapper = document.createElement('div');
  wrapper.className = 'sticky-group';
  first.before(wrapper);

  let node = wrapper.nextSibling;
  while (node) {
    const next: ChildNode | null = node.nextSibling;
    wrapper.appendChild(node);
    if (node === last) break;
    node = next;
  }

  /* Merged groups lose their own wrapper so the result is a single group. */
  wrapper.querySelectorAll('.sticky-group').forEach(inner => inner.replaceWith(...Array.from(inner.childNodes)));
  return true;
}
