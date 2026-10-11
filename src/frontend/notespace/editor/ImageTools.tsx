import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Icon, type IconName } from '../../components/Icon';
import { imageUrl, loadImage } from '../imageStore';
import { IMAGE_ALIGNS, MIN_IMAGE_WIDTH, imageAlign, imageFiles, insertImageFiles, setImageAlign, setImageWidth, type ImageAlign } from './images';
import type { EditorSession } from './session';

type ImageToolsProps = {
  session: EditorSession;
  locked: boolean;
};

const ALIGN_ICONS: Record<ImageAlign, { icon: IconName; label: string }> = {
  left: { icon: 'align-left', label: 'In the text' },
  center: { icon: 'align-center', label: 'Centre on its own line' },
  right: { icon: 'align-right', label: 'Right, with text beside it' }
};


/* =========================
   Image Files
   ========================= */

/* The file name an image downloads as, such as image.png. */
function fileName(file: Blob) {
  const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg').replace('svg+xml', 'svg') || 'png';
  return `image.${extension}`;
}

async function downloadImage(id: string) {
  const file = await loadImage(id);
  if (!file) return;
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName(file);
  link.click();
  URL.revokeObjectURL(url);
}

/* Copy the picture itself, so it can be pasted into this or any other app. Clipboards take PNG */
/* pictures, so other formats are converted first. */
async function copyImage(id: string) {
  const file = await loadImage(id);
  if (!file || typeof ClipboardItem === 'undefined') return;
  let png = file;
  if (file.type !== 'image/png') {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject()), 'image/png'));
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}


/* =========================
   Image Tools
   ========================= */

/* Clicking an image selects it and shows a small bar above it: where it sits on its line, */
/* download, comment and delete (only download and comment on a locked note). The handle at its */
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
        const bounds = found.getBoundingClientRect();
        const scale = bounds.width / (found.offsetWidth || 1);
        resizing.current = { block: found, align: imageAlign(found), scale, startX: event.clientX, startWidth: bounds.width / scale };
        found.classList.add('is-resizing');
      }
    }

    /* The width changes by how far the pointer moved since the drag started (twice as much for a */
    /* centred image, which grows on both sides, and the other way for a right image, whose handle */
    /* is on its left). It is measured from the start because the image itself can move while the */
    /* text around it rewraps. It never passes its line. */
    function handlePointerMove(event: PointerEvent) {
      const current = resizing.current;
      if (!current) return;
      const moved = (event.clientX - current.startX) / current.scale;
      const change = current.align === 'right' ? -moved : current.align === 'center' ? moved * 2 : moved;
      const line = current.block.parentElement?.clientWidth ?? Infinity;
      setImageWidth(current.block, Math.min(line, Math.max(MIN_IMAGE_WIDTH, current.startWidth + change)));
      setTick(tick => tick + 1);
    }

    function handlePointerUp() {
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
      imageUrl(found.dataset.image ?? '').then(url => {
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
        copyImage(selected.dataset.image ?? '').catch(() => undefined);
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
  const id = shown.dataset.image ?? '';
  const align = imageAlign(shown);

  function changeAlign(next: ImageAlign) {
    session.checkpoint();
    setImageAlign(shown, next);
    session.commit();
    setTick(tick => tick + 1);
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
  const bounds = shown.getBoundingClientRect();
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
            {!locked && IMAGE_ALIGNS.map((option, index) => (
              <button
                key={option}
                type="button"
                className={`page-bar-button ${align === option ? 'selected' : ''}`}
                aria-pressed={align === option}
                data-tooltip={ALIGN_ICONS[option].label}
                data-tooltip-align={index ? undefined : 'start'}
                aria-label={ALIGN_ICONS[option].label}
                onClick={() => changeAlign(option)}
              >
                <Icon name={ALIGN_ICONS[option].icon} size={16} />
              </button>
            ))}
            {!locked && <span className="image-tools-divider" />}
            <button type="button" className="page-bar-button" data-tooltip="Download" aria-label="Download" onClick={() => downloadImage(id)}>
              <Icon name="download" size={16} />
            </button>
            <button type="button" className="page-bar-button" data-tooltip="Comment" aria-label="Comment" onClick={() => setCommenting(true)}>
              <Icon name="message-square" size={16} />
            </button>
            {!locked && (
              <button type="button" className="page-bar-button" data-tooltip="Delete" data-tooltip-align="end" aria-label="Delete image" onClick={remove}>
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
