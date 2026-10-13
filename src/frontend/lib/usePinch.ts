import { useEffect, useRef, type RefObject } from 'react';


/* =========================
   Pinch to Zoom
   ========================= */

/* Two fingers pinching on the element change a zoom level: spreading them zooms in, closing them */
/* zooms out, in proportion to how far they move. The browser's own pinch (zooming the whole page) */
/* is stopped there, so the two do not fight; the element should also have touch-action: pan-x */
/* pan-y, which stops it before it starts. */
export function usePinch(ref: RefObject<HTMLElement | null>, zoom: number, onZoom: (zoom: number) => void) {
  const latest = useRef({ zoom, onZoom });
  latest.current = { zoom, onZoom };

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let start: { distance: number; zoom: number } | null = null;
    const distance = (touches: TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);

    function handleStart(event: TouchEvent) {
      if (event.touches.length === 2) start = { distance: distance(event.touches), zoom: latest.current.zoom };
    }
    function handleMove(event: TouchEvent) {
      if (!start || event.touches.length !== 2) return;
      event.preventDefault();
      latest.current.onZoom(start.zoom * (distance(event.touches) / start.distance));
    }
    function handleEnd(event: TouchEvent) {
      if (event.touches.length < 2) start = null;
    }

    element.addEventListener('touchstart', handleStart, { passive: true });
    element.addEventListener('touchmove', handleMove, { passive: false });
    element.addEventListener('touchend', handleEnd);
    element.addEventListener('touchcancel', handleEnd);
    return () => {
      element.removeEventListener('touchstart', handleStart);
      element.removeEventListener('touchmove', handleMove);
      element.removeEventListener('touchend', handleEnd);
      element.removeEventListener('touchcancel', handleEnd);
    };
  }, [ref]);
}
