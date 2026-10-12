import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Icon, type IconName } from '../../../components/Icon';
import { imageUrl, loadImage } from '../../imageStore';
import { DRAWING_WRAPS, IMAGE_ALIGNS, MIN_IMAGE_WIDTH, drawingFile, drawingInk, drawingWrap, imageAlign, imageFiles, insertImageFiles, setImageAlign, setImageWidth, type ImageAlign } from './images';
import { getPreferences } from '../../../app/preferences';
import { anchoredBox, detachDrawing, moveDrawing } from '../drawing/anchoring';
import type { DrawingWrap } from './images';
import type { EditorSession } from '../session';
import { zoomed } from '../../../lib/geometry';
import { downloadFile } from '../../../lib/files';

type ImageToolsProps = {
  session: EditorSession;
  locked: boolean;
};

const ALIGN_ICONS: Record<ImageAlign, { icon: IconName; label: string }> = {
  left: { icon: 'align-left', label: 'In the text' },
  'wrap-left': { icon: 'wrap-left', label: 'Left, with text beside it' },
  center: { icon: 'align-center', label: 'Centre on its own line' },
  right: { icon: 'wrap-right', label: 'Right, with text beside it' }
};


/* =========================
   Image Files
   ========================= */

/* The file name an image downloads as, such as image.png. */
function fileName(file: Blob) {
  const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg').replace('svg+xml', 'svg') || 'png';
  return `image.${extension}`;
}

/* The file an image block shows: its picture from the image store, or an anchored drawing as SVG. */
function blockFile(block: HTMLElement) {
  return block.classList.contains('drawing-block') ? Promise.resolve(drawingFile(block)) : loadImage(block.dataset.image ?? '');
}

/* An address the full-size viewer can show the block's picture from. */
async function blockUrl(block: HTMLElement) {
  if (!block.classList.contains('drawing-block')) return imageUrl(block.dataset.image ?? '');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(await drawingFile(block).text())}`;
}

async function downloadImage(block: HTMLElement) {
  const file = await blockFile(block);
  if (file) downloadFile(block.classList.contains('drawing-block') ? 'drawing.svg' : fileName(file), file);
}

/* Copy the picture itself, so it can be pasted into this or any other app. Clipboards take PNG */
/* pictures, so other formats are converted first (a drawing at twice its size, so it stays sharp). */
async function copyImage(block: HTMLElement) {
  const file = await blockFile(block);
  if (!file || typeof ClipboardItem === 'undefined') return;
  let png = file;
  if (file.type !== 'image/png') {
    const url = URL.createObjectURL(file);
    const picture = new Image();
    await new Promise((resolve, reject) => {
      picture.onload = resolve;
      picture.onerror = reject;
      picture.src = url;
    });
    const scale = file.type === 'image/svg+xml' ? 2 : 1;
    const canvas = document.createElement('canvas');
    canvas.width = picture.naturalWidth * scale;
    canvas.height = picture.naturalHeight * scale;
    canvas.getContext('2d')?.drawImage(picture, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject()), 'image/png'));
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}


/* =========================
   Image Tools
   ========================= */

/* Clicking an image selects it and shows a small bar above it: where it sits on its line, */
/* detach (for an anchored drawing), download, comment and delete (only download and comment on */
/* a locked note). An anchored drawing can also be dragged to a new place, where it is anchored */
/* again (lined up with its line, or exactly where it is dropped when snapping is off). The handle at its */
/* corner resizes it, keeping its shape. Double-click shows it full size until Escape or a click */
/* beside it. While it is selected, Backspace or Delete removes it and Ctrl + C copies the picture. */
/* Image files dropped on the note are added where they are dropped. */
export function ImageTools({ session, locked }: ImageToolsProps) {
  const [image, setImage] = useState<HTMLElement | null>(null);
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState('');
  const [viewing, setViewing] = useState<string | null>(null);

  /* Redraw when the page scrolls or the note changes, so the bar stays above its image. */
  const [, setTick] = useState(0);
  const resizing = useRef<{ block: HTMLElement; align: ImageAlign; scale: number; startX: number; startWidth: number } | null>(null);

  /* An anchored drawing being dragged to a new place; it only starts moving after a few pixels, */
  /* so a plain click still just selects it. */
  const moving = useRef<{ block: HTMLElement; scale: number; startX: number; startY: number; minDy: number; moved: boolean } | null>(null);
  const latest = useRef({ image, locked, viewing });
  latest.current = { image, locked, viewing };

  function select(next: HTMLElement | null) {
    latest.current.image?.classList.remove('is-selected');
    next?.classList.add('is-selected');
    setImage(next);
    setCommenting(false);
    setComment('');
  }

  useEffect(() => {
    const body = () => session.body();
    const scroller = session.scroller();
    const imageAt = (target: EventTarget | null) => {
      const found = (target as Element | null)?.closest?.<HTMLElement>('.image-block') ?? null;
      return found && body()?.contains(found) ? found : null;
    };

    function handleMouseDown(event: MouseEvent) {
      const target = event.target as Element;
      if (target.closest?.('.image-tools, .image-viewer')) return;
      const found = imageAt(target);
      if (!found) {
        if (latest.current.image) select(null);
        return;
      }
      event.preventDefault();

      /* The caret moves to just after the image, so typing carries on there. */
      const caret = document.createRange();
      caret.setStartAfter(found);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(caret);
      select(found);

      if (target.closest('.image-resize') && !latest.current.locked && event.button === 0) {
        session.checkpoint();
        const { rect: bounds, scale } = zoomed(drawingInk(found));
        resizing.current = { block: found, align: imageAlign(found), scale, startX: event.clientX, startWidth: bounds.width / scale };
        found.classList.add('is-resizing');
      } else if (found.classList.contains('drawing-block') && !latest.current.locked && event.button === 0) {
        const { rect: bounds, scale } = zoomed(drawingInk(found));
        /* It belongs to the text, so it stops at the top of the text instead of going over the details. */
        const textTop = body()?.getBoundingClientRect().top ?? -Infinity;
        moving.current = {
          block: found, scale, startX: event.clientX, startY: event.clientY, minDy: textTop - bounds.top, moved: false
        };
      }
    }

    /* The width changes by how far the pointer moved since the drag started (twice as much for a */
    /* centred image, which grows on both sides, and the other way for a right image, whose handle */
    /* is on its left). It is measured from the start because the image itself can move while the */
    /* text around it rewraps. It never passes its line. */
    function handlePointerMove(event: PointerEvent) {
      const move = moving.current;
      if (move) {
        const dx = event.clientX - move.startX;
        const dy = Math.max(move.minDy, event.clientY - move.startY);
        if (!move.moved && Math.hypot(dx, dy) < 4) return;
        move.moved = true;
        move.block.style.transform = `translate(${dx / move.scale}px, ${dy / move.scale}px)`;
        setTick(tick => tick + 1);
        return;
      }
      const current = resizing.current;
      if (!current) return;
      const moved = (event.clientX - current.startX) / current.scale;
      const change = current.align === 'right' ? -moved : current.align === 'center' ? moved * 2 : moved;
      const line = current.block.parentElement?.clientWidth ?? Infinity;
      setImageWidth(current.block, Math.min(line, Math.max(MIN_IMAGE_WIDTH, current.startWidth + change)));
      setTick(tick => tick + 1);
    }

    function handlePointerUp() {
      const move = moving.current;
      moving.current = null;
      if (move?.moved) {
        const box = anchoredBox(session, move.block);
        move.block.style.removeProperty('transform');
        const placement = { wrap: drawingWrap(move.block), snap: getPreferences().drawing.snap };
        if (box) moveDrawing(session, move.block, box, placement, [document.querySelector<HTMLElement>('.image-tools')]);
        setTick(tick => tick + 1);
      }
      const current = resizing.current;
      if (!current) return;
      resizing.current = null;
      current.block.classList.remove('is-resizing');
      session.commit();
    }

    function handleDoubleClick(event: MouseEvent) {
      const found = imageAt(event.target);
      if (!found || (event.target as Element).closest('.image-resize')) return;
      event.preventDefault();
      blockUrl(found).then(url => {
        if (url) setViewing(url);
      });
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (latest.current.viewing) {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          setViewing(null);
        }
        return;
      }
      const selected = latest.current.image;
      if (!selected || (event.target as Element).closest?.('.image-tools')) return;
      const command = event.ctrlKey || event.metaKey;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        select(null);
      } else if ((event.key === 'Backspace' || event.key === 'Delete') && !latest.current.locked) {
        event.preventDefault();
        event.stopPropagation();
        session.checkpoint();
        selected.remove();
        select(null);
        session.commit();
      } else if (command && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        event.stopPropagation();
        copyImage(selected).catch(() => undefined);
      } else if (!['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) {
        select(null);
      }
    }

    /* Files dragged over the note may be dropped into it; other drags are left alone. */
    const fileDrag = (event: DragEvent) => Boolean(event.dataTransfer?.types.includes('Files')) && !latest.current.locked
      && Boolean(body()?.contains(event.target as Node));

    function handleDragOver(event: DragEvent) {
      if (!fileDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    }

    function handleDrop(event: DragEvent) {
      if (!fileDrag(event)) return;
      const files = imageFiles(event.dataTransfer);
      event.preventDefault();
      event.stopPropagation();
      if (!files.length) return;
      const point = document.caretRangeFromPoint?.(event.clientX, event.clientY) ?? null;
      body()?.focus({ preventScroll: true });
      insertImageFiles(session, files, point);
    }

    function handleScroll() {
      setTick(tick => tick + 1);
    }

    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('dblclick', handleDoubleClick);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('dragover', handleDragOver, true);
    document.addEventListener('drop', handleDrop, true);
    scroller?.addEventListener('scroll', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('dblclick', handleDoubleClick);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('dragover', handleDragOver, true);
      document.removeEventListener('drop', handleDrop, true);
      scroller?.removeEventListener('scroll', handleScroll);
    };
  }, [session]);

  const viewer = viewing && (
    <div className="image-viewer" role="dialog" aria-label="Image" onMouseDown={event => { if (event.target === event.currentTarget) setViewing(null); }}>
      <img src={viewing} alt="" />
    </div>
  );

  /* Undo or a mode change redraws the note, which removes the image the bar was for. */
  if (!image?.isConnected) return viewer || null;
  const shown = image;
  const align = imageAlign(shown);

  function changeAlign(next: ImageAlign) {
    session.checkpoint();
    setImageAlign(shown, next);
    session.commit();
    setTick(tick => tick + 1);
  }

  /* An anchored drawing can sit wrapped by the text or in front of it; changing keeps it in place. */
  function changeWrap(next: DrawingWrap) {
    const box = anchoredBox(session, shown);
    if (box) moveDrawing(session, shown, box, { wrap: next, snap: getPreferences().drawing.snap }, [document.querySelector<HTMLElement>('.image-tools')]);
    setTick(tick => tick + 1);
  }

  /* An anchored drawing can be turned back into loose strokes where it sits. */
  function detach() {
    select(null);
    detachDrawing(session, shown);
  }

  function remove() {
    session.checkpoint();
    shown.remove();
    select(null);
    session.commit();
  }

  function saveComment(event: FormEvent) {
    event.preventDefault();
    if (comment.trim()) session.addComment(shown, comment);
    select(null);
  }

  function handleFormKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    setCommenting(false);
  }

  /* The bar sits above the image, or below it when there is no room above. */
  const bounds = drawingInk(shown).getBoundingClientRect();
  const isDrawing = shown.classList.contains('drawing-block');
  const wrap = isDrawing ? drawingWrap(shown) : 'wrap';
  const below = bounds.top < 120;
  const style = {
    top: below ? bounds.bottom + 8 : bounds.top - 8,
    left: Math.max(8, Math.min(bounds.left, window.innerWidth - 300)),
    transform: below ? undefined : 'translateY(-100%)'
  };

  return (
    <>
      <div className="image-tools" style={style} role="toolbar" aria-label="Image">
        {commenting ? (
          <form className="image-tools-comment" onSubmit={saveComment} onKeyDown={handleFormKeyDown}>
            <input className="selection-input" value={comment} autoFocus placeholder="Add a comment" onChange={event => setComment(event.target.value)} />
            <button type="submit" className="btn btn-sm btn-primary" disabled={!comment.trim()}>Comment</button>
          </form>
        ) : (
          <>
            {!locked && isDrawing && DRAWING_WRAPS.map((option, index) => (
              <button
                key={option.value}
                type="button"
                className={`page-bar-button ${wrap === option.value ? 'selected' : ''}`}
                aria-pressed={wrap === option.value}
                data-tooltip={option.label}
                data-tooltip-wrap=""
                data-tooltip-align={index ? undefined : 'start'}
                aria-label={option.label}
                onClick={() => changeWrap(option.value)}
              >
                <Icon name={option.icon} size={16} />
              </button>
            ))}
            {!locked && isDrawing && wrap === 'wrap' && <span className="image-tools-divider" />}
            {!locked && wrap === 'wrap' && IMAGE_ALIGNS.map((option, index) => (
              <button
                key={option}
                type="button"
                className={`page-bar-button ${align === option ? 'selected' : ''}`}
                aria-pressed={align === option}
                data-tooltip={ALIGN_ICONS[option].label}
                data-tooltip-align={index || isDrawing ? undefined : 'start'}
                aria-label={ALIGN_ICONS[option].label}
                onClick={() => changeAlign(option)}
              >
                <Icon name={ALIGN_ICONS[option].icon} size={16} />
              </button>
            ))}
            {!locked && <span className="image-tools-divider" />}
            {!locked && shown.classList.contains('drawing-block') && (
              <button type="button" className="page-bar-button" data-tooltip="Detach: turn back into loose strokes" aria-label="Detach" onClick={detach}>
                <Icon name="box-select" size={16} />
              </button>
            )}
            <button type="button" className="page-bar-button" data-tooltip="Download" aria-label="Download" onClick={() => downloadImage(shown)}>
              <Icon name="download" size={16} />
            </button>
            <button type="button" className="page-bar-button" data-tooltip="Comment" aria-label="Comment" onClick={() => setCommenting(true)}>
              <Icon name="message-square" size={16} />
            </button>
            {!locked && (
              <button type="button" className="page-bar-button" data-tooltip="Delete" data-tooltip-align="end" aria-label={shown.classList.contains('drawing-block') ? 'Delete drawing' : 'Delete image'} onClick={remove}>
                <Icon name="trash" size={16} />
              </button>
            )}
          </>
        )}
      </div>
      {viewer}
    </>
  );
}
