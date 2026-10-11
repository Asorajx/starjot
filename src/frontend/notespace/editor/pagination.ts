import { useLayoutEffect, useState, type RefObject } from 'react';
import type { PageSize } from '../../../shared/types/note';
import { useSessionValue, type EditorSession } from './session';

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

/* The lines moved down to the next page last time, for each paginated note, so they can be put */
/* back before the pages are worked out again. */
const pushedLines = new WeakMap<HTMLElement, HTMLElement[]>();


/* =========================
   Laying Out Pages
   ========================= */

/* The parts of the note that are moved to the next page as a whole: each line (or block), and */
/* each sticky group, unless the group is taller than a page and has to be split between its lines. */
function pageUnits(body: HTMLElement, contentHeight: number, scale: number) {
  return Array.from(body.children).flatMap(child => {
    const element = child as HTMLElement;
    const tall = element.getBoundingClientRect().height / scale > contentHeight;
    return element.classList.contains('sticky-group') && tall ? Array.from(element.children) as HTMLElement[] : [element];
  });
}

/* Put back the lines that were moved down to the next page. Every marked line inside the note is */
/* found again, not only the ones marked last time: pressing Enter in a moved line makes the */
/* browser copy its mark onto the new line, which would otherwise keep the extra space for good. */
export function clearPages(frame: HTMLElement | null) {
  if (!frame) return;
  const marked = new Set([...(pushedLines.get(frame) ?? []), ...Array.from(frame.querySelectorAll<HTMLElement>('.page-pushed'))]);
  marked.forEach(line => {
    line.classList.remove('page-pushed');
    line.style.removeProperty('--page-push');
    if (!line.getAttribute('style')) line.removeAttribute('style');
    if (!line.className) line.removeAttribute('class');
  });
  pushedLines.delete(frame);
}

/* Lay the note out on pages: a line that would cross the bottom margin of a page moves to the top */
/* of the next page (by a larger top margin, which is only shown on screen and never saved). A line */
/* taller than a whole page stays where it is. frame is the element the pages are drawn in, starting */
/* at its top; it may be zoomed. Returns how many pages the note needs. */
export function layOutPages(frame: HTMLElement, body: HTMLElement, geometry: PageGeometry) {
  clearPages(frame);
  const frameBounds = frame.getBoundingClientRect();

  /* With zoom, positions on screen are scaled; the page sizes are not. */
  const scale = frame.offsetHeight ? frameBounds.height / frame.offsetHeight : 1;
  const step = pageStep(geometry);
  const contentHeight = geometry.height - geometry.margin * 2;

  /* Read every position first and change the page afterwards, so the browser lays the page out once. */
  const units = pageUnits(body, contentHeight, scale).map(element => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const previous = element.previousElementSibling;
    return {
      element,
      top: (bounds.top - frameBounds.top) / scale,
      bottom: (bounds.bottom - frameBounds.top) / scale,
      marginTop: parseFloat(style.marginTop) || 0,
      previousMargin: previous ? parseFloat(getComputedStyle(previous).marginBottom) || 0 : 0
    };
  });

  const pushed: HTMLElement[] = [];
  let shift = 0;
  let end = 0;
  units.forEach(unit => {
    const top = unit.top + shift;
    const bottom = unit.bottom + shift;
    const page = Math.floor(top / step);
    const textTop = page * step + geometry.margin;
    const textBottom = page * step + geometry.height - geometry.margin;
    if (bottom > textBottom + 0.5 && unit.bottom - unit.top <= contentHeight && top > textTop + 0.5) {
      const extra = (page + 1) * step + geometry.margin - top;

      /* Neighbouring margins overlap, so the new margin starts from the larger of the two. */
      unit.element.style.setProperty('--page-push', `${Math.max(unit.marginTop, unit.previousMargin) + extra}px`);
      unit.element.classList.add('page-pushed');
      pushed.push(unit.element);
      shift += extra;
    }
    end = Math.max(end, unit.bottom + shift);
  });
  pushedLines.set(frame, pushed);
  return Math.max(1, Math.floor(Math.max(0, end - 1) / step) + 1);
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

    /* Waiting for the next frame lets several changes in a row be laid out once. */
    let request = 0;
    const run = () => {
      cancelAnimationFrame(request);
      request = requestAnimationFrame(() => {
        const current = session.body();
        if (current && element.isConnected) setPages(layOutPages(element, current, geometry));
      });
    };
    run();
    const observer = new ResizeObserver(run);
    observer.observe(body);
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(request);
    };
  }, [session, width, height, layout, revision, key]);

  return geometry ? pages : 1;
}
