import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Icon, type IconName } from './Icon';
import { useDismiss } from '../lib/useDismiss';
import type { NoteKind } from '../../shared/types/note';


/* =========================
   New Note Menu
   ========================= */

const KINDS: { kind: NoteKind; label: string; hint: string; icon: IconName }[] = [
  { kind: 'document', label: 'Document', hint: 'Text on a page', icon: 'file-text' },
  { kind: 'canvas', label: 'Canvas', hint: 'An endless space to draw on', icon: 'pen-tool' }
];

/* The New note button on Notespace Home and category pages. It opens a small menu to choose a */
/* document or a canvas; the arrow keys move between the two and Escape closes it. */
export function NewNoteMenu({ onCreate }: { onCreate: (kind: NoteKind) => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);
  useDismiss(open, '.new-note-menu', () => setOpen(false));

  /* The first choice takes focus as the menu opens, so Enter makes a document straight away. */
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [open]);

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  }

  return (
    <span className="new-note-menu">
      <button className="btn btn-primary" type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <Icon name="plus" size={16} /><span>New note</span><Icon name="chevron-down" size={14} />
      </button>
      {open && (
        <span ref={menuRef} className="page-menu new-note-choices" role="menu" aria-label="New note" onKeyDown={handleKeyDown}>
          {KINDS.map(item => (
            <button
              key={item.kind}
              type="button"
              role="menuitem"
              className="page-menu-item"
              onClick={() => {
                setOpen(false);
                onCreate(item.kind);
              }}
            >
              <Icon name={item.icon} size={16} />
              <span className="new-note-choice">
                {item.label}
                <small>{item.hint}</small>
              </span>
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
