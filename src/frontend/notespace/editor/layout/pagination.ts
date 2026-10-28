import { useLayoutEffect, useState, type RefObject } from 'react';
import type { PageSize } from '../../../../shared/types/note';
import { useSessionValue, type EditorSession } from '../session';
import { tableGrid } from '../tables/tables';

/* Page sizes in CSS pixels (96 to an inch), upright. */
const PAGE_SIZES: Record<PageSize, { width: number; height: number }> = {
  a4: { width: 794, height: 1123 },
  letter: { width: 816, height: 1056 }
};

/* Every page keeps a one-inch margin around its text, like a printed page. */
const PAGE_MARGIN = 96;

/* The grey space between pages on screen. */
const PAGE_GAP = 24;

export type PageGeometry = { width: number; height: number; margin: number; gap: number };

export function pageGeometry(size: PageSize, landscape: boolean): PageGeometry {
  const { width, height } = PAGE_SIZES[size];
  return landscape
    ? { width: height, height: width, margin: PAGE_MARGIN, gap: PAGE_GAP }
    : { width, height, margin: PAGE_MARGIN, gap: PAGE_GAP };
}

/* The distance from the top of one page to the top of the next. */
export function pageStep(geometry: PageGeometry) {
  return geometry.height + geometry.gap;
}

/* Marks used for screen-only pagination. They are never part of the saved note. */
const pushedLines = new WeakMap<HTMLElement, HTMLElement[]>();

/* A row-spanning cell joins its rows into one page unit. Otherwise a break could move one */
/* half of the merged cell without moving the other half. */
function rowGroups(table: HTMLTableElement) {
  const rows = Array.from(table.rows);
  const groups: HTMLTableRowElement[][] = [];
  let first = 0;
  let last = 0;
  rows.forEach((row, index) => {
    last = Math.max(last, index, ...Array.from(row.cells).map(cell => index + cell.rowSpan - 1));
    if (index >= last) {
      groups.push(rows.slice(first, index + 1));
      first = index + 1;
    }
  });
  return groups;
}

type PageUnit = { element: HTMLElement; startsPage: boolean; table?: HTMLTableElement; rows?: HTMLTableRowElement[]; keepWithNext?: boolean };

/* A tall table becomes a sequence of whole rows, rather than a single block. In Block mode the */
/* table is inside the block-content element, while Continuous mode has the table directly. */
function pageUnits(body: HTMLElement, contentHeight: number, scale: number): PageUnit[] {
  return Array.from(body.children).flatMap(child => {
    const element = child as HTMLElement;
    const table = element.matches('table') ? element as HTMLTableElement
      : element.querySelector<HTMLTableElement>(':scope > .block-content > table');
    if (table && table.getBoundingClientRect().height / scale > contentHeight) {
      const groups = rowGroups(table);
      return groups.map((rows, index) => ({
        element: rows[0], rows, table, startsPage: false,
        keepWithNext: index === 0 && table.rows[0]?.cells[0]?.tagName === 'TH' && groups.length > 1
      }));
    }
    const tall = element.getBoundingClientRect().height / scale > contentHeight;
    if (!element.classList.contains('sticky-group') || !tall) return [{ element, startsPage: false }];
    return (Array.from(element.children) as HTMLElement[]).map((line, index) => ({ element: line, startsPage: index === 0 }));
  });
}

/* The preview's repeated headers and page-gap covers live OUTSIDE the editable note. Cloning */
/* them does not alter the note's table rows, its selection, its history or the PDF/print DOM. */
function overlayLayer(frame: HTMLElement) {
  return frame.querySelector<HTMLElement>(':scope > .page-preview-overlays');
}

/* Put back every screen-only mark. A browser may copy a page-pushed mark when Enter inserts a */
/* new paragraph, so search the DOM rather than relying only on the previous marks. */
export function clearPages(frame: HTMLElement | null) {
  if (!frame) return;
  const marked = new Set([...(pushedLines.get(frame) ?? []), ...Array.from(frame.querySelectorAll<HTMLElement>('.page-pushed'))]);
  marked.forEach(line => {
    line.classList.remove('page-pushed');
    line.style.removeProperty('--page-push');
    if (!line.getAttribute('style')) line.removeAttribute('style');
    if (!line.className) line.removeAttribute('class');
  });
  frame.querySelectorAll<HTMLElement>('.page-first-column').forEach(cell => {
    cell.classList.remove('page-first-column');
    if (!cell.className) cell.removeAttribute('class');
  });
  frame.querySelectorAll<HTMLElement>('.page-table-row, .page-table-break').forEach(row => {
    row.classList.remove('page-table-row', 'page-table-break');
    row.style.removeProperty('--table-row-shift');
    if (!row.getAttribute('style')) row.removeAttribute('style');
    if (!row.className) row.removeAttribute('class');
  });
  frame.querySelectorAll<HTMLElement>('.page-table-expanded').forEach(table => {
    table.classList.remove('page-table-expanded');
    table.style.removeProperty('--table-page-push');
    table.style.removeProperty('--table-original-margin');
    if (!table.getAttribute('style')) table.removeAttribute('style');
    if (!table.className) table.removeAttribute('class');
  });
  overlayLayer(frame)?.replaceChildren();
  pushedLines.delete(frame);
}

/* Scroll back to a table's real header row, just below the page bar. The caret, the table and */
/* the saved note are left as they are. */
export function revealOriginalHeader(row: HTMLTableRowElement) {
  if (!row.isConnected) return;
  const scroller = row.closest<HTMLElement>('.main-scroll');
  if (!scroller) return;
  const top = scroller.getBoundingClientRect().top;
  const bar = scroller.querySelector<HTMLElement>('.page-bar');
  const visibleTop = Math.max(top, bar?.getBoundingClientRect().bottom ?? top) + 16;
  const target = Math.max(0, scroller.scrollTop + row.getBoundingClientRect().top - visibleTop);
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  scroller.scrollTo({ top: target, behavior: reducedMotion ? 'instant' : 'smooth' });
}

/* A repeated header must have the same column positions as its actual table. The overlay is a */
/* copy of only the first row, set to the measured widths of the real cells, and cannot be edited; */
/* double-clicking it (or Enter or Space once it has focus) goes back to the real header. Pressing */
/* on it keeps the caret where it was, and a link copied into it does nothing. */
function showRepeatedHeader(layer: HTMLElement, table: HTMLTableElement, row: HTMLTableRowElement, frameBounds: DOMRect, scale: number, page: number, step: number, geometry: PageGeometry) {
  const tableBounds = table.getBoundingClientRect();
  const preview = document.createElement('div');
  preview.className = 'page-repeat-header';
  preview.setAttribute('role', 'button');
  preview.setAttribute('aria-label', 'Return to original table header');
  preview.title = 'Double-click to return to the original header';
  preview.tabIndex = 0;
  preview.addEventListener('mousedown', event => event.preventDefault());
  preview.addEventListener('click', event => event.preventDefault());
  preview.addEventListener('dblclick', event => {
    event.preventDefault();
    revealOriginalHeader(row);
  });
  preview.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    revealOriginalHeader(row);
  });
  preview.style.left = `${(tableBounds.left - frameBounds.left) / scale}px`;
  preview.style.top = `${page * step + geometry.margin}px`;
  preview.style.width = `${tableBounds.width / scale}px`;

  const copy = document.createElement('table');
  copy.className = 'page-header-table';
  copy.style.width = '100%';
  const heading = row.cloneNode(true) as HTMLTableRowElement;
  heading.setAttribute('aria-hidden', 'true');
  heading.removeAttribute('id');
  heading.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
  heading.querySelectorAll<HTMLElement>('a, button, input, select, textarea, [tabindex]').forEach(element => {
    element.tabIndex = -1;
  });
  Array.from(heading.cells).forEach((cell, index) => {
    const original = row.cells[index];
    if (original) cell.style.width = `${original.getBoundingClientRect().width / scale}px`;
  });
  const head = copy.createTHead();
  head.append(heading);
  preview.append(copy);
  layer.append(preview);
}

/* Hide any table borders that would otherwise cross the bottom margin or grey page gap. The */
/* overlay also redraws the preceding page number, which the white margin cover conceals. */
function showPageGaps(layer: HTMLElement, pages: number, geometry: PageGeometry) {
  const step = pageStep(geometry);
  for (let index = 0; index < pages - 1; index += 1) {
    const mask = document.createElement('div');
    mask.className = 'page-gap-mask';
    mask.setAttribute('aria-hidden', 'true');
    mask.style.top = `${index * step + geometry.height - geometry.margin}px`;
    mask.style.height = `${geometry.margin * 2 + geometry.gap}px`;

    /* The colours are in editor.css, so the dark theme gives them the sheets' dark colours. */
    const strip = document.createElement('div');
    strip.className = 'page-gap-strip';
    strip.style.top = `${geometry.margin}px`;
    strip.style.height = `${geometry.gap}px`;
    mask.append(strip);
    layer.append(mask);
    const number = document.createElement('span');
    number.className = 'page-preview-number';
    number.setAttribute('aria-hidden', 'true');
    number.style.top = `${index * step + geometry.height - 52}px`;
    number.textContent = String(index + 1);
    layer.append(number);
  }
}

/* Lay out blocks and tall tables on pages. Rows are shifted with CSS transforms (not DOM */
/* insertions or artificial table rows), and the table's bottom margin reserves the same height */
/* in normal flow. All positions are measured before anything is changed. */
export function layOutPages(frame: HTMLElement, body: HTMLElement, geometry: PageGeometry) {
  clearPages(frame);

  /* Tables on pages draw each cell's borders (see editor.css); cells in the first column add the */
  /* left one. The first cell of a row is not always in the first column (beside a merged cell). */
  body.querySelectorAll('table').forEach(table => {
    tableGrid(table).places.forEach((place, cell) => {
      if (place.column === 0) cell.classList.add('page-first-column');
    });
  });
  const frameBounds = frame.getBoundingClientRect();
  const scale = frame.offsetHeight ? frameBounds.height / frame.offsetHeight : 1;
  const step = pageStep(geometry);
  const contentHeight = geometry.height - geometry.margin * 2;
  const units = pageUnits(body, contentHeight, scale).map(unit => {
    const bounds = unit.element.getBoundingClientRect();
    const lastBounds = unit.rows?.at(-1)?.getBoundingClientRect() ?? bounds;
    /* The space above it as laid out: neighbouring margins overlap, and a group's first line's */
    /* margin reaches through the group's edge, so the gap is measured rather than worked out. */
    const before = unit.element.previousElementSibling ?? (unit.startsPage ? unit.element.parentElement?.previousElementSibling : null);
    return {
      ...unit,
      top: (bounds.top - frameBounds.top) / scale,
      bottom: (lastBounds.bottom - frameBounds.top) / scale,
      gap: before ? (bounds.top - before.getBoundingClientRect().bottom) / scale : parseFloat(getComputedStyle(unit.element).marginTop) || 0
    };
  });

  const tableShifts = new Map<HTMLTableElement, number>();
  const tableFirstPages = new Map<HTMLTableElement, number>();
  const repeatedPages = new Map<HTMLTableElement, Set<number>>();
  const layer = overlayLayer(frame);
  const pushed: HTMLElement[] = [];
  let shift = 0;
  let end = 0;
  units.forEach((unit, index) => {
    let top = unit.top + shift;
    const bottom = unit.bottom + shift;
    const page = Math.floor(top / step);
    const textTop = page * step + geometry.margin;
    const textBottom = page * step + geometry.height - geometry.margin;

    if (unit.table && unit.rows) {
      const table = unit.table;
      const header = table.rows[0];
      const repeats = table.classList.contains('repeat-header') && header && Array.from(header.cells).every(cell => cell.tagName === 'TH');
      const headerHeight = repeats ? header.getBoundingClientRect().height / scale : 0;
      const first = !tableFirstPages.has(table);
      const next = units[index + 1];
      const lookAhead = first && unit.keepWithNext && next?.table === table ? next.bottom - unit.bottom : 0;
      const crosses = bottom + lookAhead > textBottom + 0.5;
      const groupHeight = unit.bottom - unit.top;
      /* A row-spanning group is indivisible, even if it contains several physical rows. */
      if (crosses && groupHeight <= contentHeight - (first ? 0 : headerHeight) && top > textTop + 0.5) {
        const extra = (page + 1) * step + geometry.margin + (first ? 0 : headerHeight) - top;
        shift += extra;
        top += extra;
        if (first) {
          /* Keep the table's header and first data row together, without adding a fake row. */
          /* As for lines, the space above it is measured, since neighbouring margins overlap. */
          const owner = table.closest('.editable-block') as HTMLElement | null ?? table;
          const above = owner.previousElementSibling;
          const gap = above ? (owner.getBoundingClientRect().top - above.getBoundingClientRect().bottom) / scale : parseFloat(getComputedStyle(owner).marginTop) || 0;
          owner.style.setProperty('--page-push', `${gap + extra}px`);
          owner.classList.add('page-pushed');
          pushed.push(owner);
        } else {
          tableShifts.set(table, (tableShifts.get(table) ?? 0) + extra);

          /* The first row on the new page gets a top border, unless a repeated header is above it. */
          if (!repeats) unit.rows[0].classList.add('page-table-break');
        }
      }
      if (first) tableFirstPages.set(table, Math.floor(top / step));
      const rowShift = tableShifts.get(table) ?? 0;
      if (rowShift) unit.rows.forEach(row => {
        row.classList.add('page-table-row');
        row.style.setProperty('--table-row-shift', `${rowShift}px`);
      });
      const currentPage = Math.floor(top / step);
      if (layer && repeats && currentPage > (tableFirstPages.get(table) ?? currentPage)) {
        const seen = repeatedPages.get(table) ?? new Set<number>();
        if (!seen.has(currentPage)) {
          showRepeatedHeader(layer, table, header, frameBounds, scale, currentPage, step, geometry);
          seen.add(currentPage);
          repeatedPages.set(table, seen);
        }
      }
    } else {
      const crosses = bottom > textBottom + 0.5 || unit.startsPage;
      if (crosses && unit.bottom - unit.top <= contentHeight && top > textTop + 0.5) {
        const extra = (page + 1) * step + geometry.margin - top;
        unit.element.style.setProperty('--page-push', `${unit.gap + extra}px`);
        unit.element.classList.add('page-pushed');
        pushed.push(unit.element);
        shift += extra;
      }
    }
    end = Math.max(end, unit.bottom + shift);
  });

  tableShifts.forEach((extra, table) => {
    const originalMargin = getComputedStyle(table).marginBottom;
    table.classList.add('page-table-expanded');
    table.style.setProperty('--table-original-margin', originalMargin);
    table.style.setProperty('--table-page-push', `${extra}px`);
  });
  const pages = Math.max(1, Math.floor(Math.max(0, end - 1) / step) + 1);
  if (layer) showPageGaps(layer, pages, geometry);
  pushedLines.set(frame, pushed);
  return pages;
}


/* =========================
   Pages Hook
   ========================= */

/* Keeps a paginated note laid out on pages while it is edited, resized or zoomed, and returns */
/* how many pages it has. With geometry null (a pageless note) the pages are cleared. */
/* key changes when the editor is replaced, such as after switching between Continuous and Block. */
export function usePages(session: EditorSession, frame: RefObject<HTMLElement | null>, geometry: PageGeometry | null, key: string) {
  const [pages, setPages] = useState(1);
  const layout = useSessionValue(session, snapshot => snapshot.layout);
  const revision = useSessionValue(session, snapshot => snapshot.revision);
  const width = geometry?.width ?? 0;
  const height = geometry?.height ?? 0;

  useLayoutEffect(() => {
    const element = frame.current;
    const body = session.body();
    if (!geometry || !element || !body) {
      clearPages(element);
      return;
    }

    /* Waiting for the next frame lets several changes in a row be laid out once. Something that */
    /* changes sizes many times a second, like dragging a table border, lays the pages out at once */
    /* instead (session.layOutPages), so a frame is never shown before its rows are moved. */
    let request = 0;
    const layOut = () => {
      cancelAnimationFrame(request);
      const current = session.body();
      if (current && element.isConnected) setPages(layOutPages(element, current, geometry));
    };
    const run = () => {
      cancelAnimationFrame(request);
      request = requestAnimationFrame(layOut);
    };
    run();
    session.layOutPages = layOut;
    const observer = new ResizeObserver(run);
    observer.observe(body);
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(request);
      if (session.layOutPages === layOut) session.layOutPages = null;
    };
  }, [session, width, height, layout, revision, key]);

  return geometry ? pages : 1;
}
