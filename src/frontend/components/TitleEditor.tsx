import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

type TitleEditorProps = {

  /* The title being renamed, such as a sub-note card's or a list row's. */
  anchor: HTMLElement;
  value: string;
  onSave: (name: string) => void;

  /* Called after saving or cancelling, to put focus back where it belongs. */
  onClose: () => void;
};


/* =========================
   Title Editor
   ========================= */

/* Renames something where its title is shown: a borderless field in the title's own font is laid */
/* over it (the title is hidden meanwhile), so it reads as editing the title itself. A field rather */
/* than making the title editable keeps the typing out of the note around it (its undo, "/" menu */
/* and Markdown shortcuts). Enter or clicking elsewhere keeps the name; Escape keeps the old one. */
export function TitleEditor({ anchor, value, onSave, onClose }: TitleEditorProps) {
  const field = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    /* The field follows the title when the page scrolls or resizes. It runs to the end of the */
    /* title's box (a card's or row's text area), so longer names have room. */
    function place() {
      const bounds = anchor.getBoundingClientRect();
      const room = anchor.parentElement?.getBoundingClientRect().right ?? bounds.right;
      const font = getComputedStyle(anchor);
      setStyle({
        top: bounds.top,
        left: bounds.left,
        width: Math.max(bounds.width, room - bounds.left),
        height: bounds.height,
        font: font.font,
        letterSpacing: font.letterSpacing,
        color: font.color
      });
    }
    place();
    anchor.style.visibility = 'hidden';
    field.current?.focus();
    field.current?.select();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      anchor.style.visibility = '';
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [anchor]);

  function finish(save: boolean) {
    if (done.current) return;
    done.current = true;
    if (save) onSave(field.current?.value.trim() ?? value);
    onClose();
  }

  return createPortal(
    <input
      ref={field}
      className="title-editor"
      style={style}
      defaultValue={value}
      placeholder="Untitled"
      aria-label="Name"
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Enter') finish(true);
        if (event.key === 'Escape') finish(false);
      }}
      onBlur={() => finish(true)}
    />,
    document.body
  );
}
