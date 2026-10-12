import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { lockNow, unlockForAWhile, updateNote } from '../store';
import { useDismiss } from '../../lib/useDismiss';


/* =========================
   Lock Status
   ========================= */

type LockStatusProps = {
  noteId: string;
  temporary: boolean;
  unlockedUntil: string | null;
};

/* A lock icon in the page bar of a locked note; its tooltip says whether the note is locked or how */
/* long it stays unlocked. Clicking it unlocks the note for a few minutes (it locks itself again after */
/* that long without an edit) or for good (lock it again in Page options), or locks it straight away. */
export function LockStatus({ noteId, temporary, unlockedUntil }: LockStatusProps) {
  const [open, setOpen] = useState(false);
  const minutes = unlockedUntil ? Math.max(1, Math.ceil((Date.parse(unlockedUntil) - Date.now()) / 60000)) : 0;
  const label = temporary ? `Unlocked · locks again in ${minutes} min` : 'Locked';

  /* Clicking anywhere else, or Escape, closes the menu (Escape without leaving the note). */
  useDismiss(open, '.lock-status', () => setOpen(false));

  const choose = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <span className="lock-status">
      <button
        type="button"
        className={`page-bar-button page-locked ${temporary ? 'is-open' : ''}`}
        data-tooltip={open ? undefined : label}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <Icon name={temporary ? 'unlock' : 'lock'} size={17} />
      </button>
      {open && (
        <span className="page-menu lock-menu" role="menu">
          {temporary ? (
            <button type="button" role="menuitem" className="page-menu-item" onClick={() => choose(() => lockNow(noteId))}>
              <Icon name="lock" size={14} /> Lock now
            </button>
          ) : (
            <button type="button" role="menuitem" className="page-menu-item" onClick={() => choose(() => unlockForAWhile(noteId))}>
              <Icon name="clock" size={14} /> Unlock for 5 minutes
            </button>
          )}
          <button type="button" role="menuitem" className="page-menu-item" onClick={() => choose(() => updateNote(noteId, { locked: false }))}>
            <Icon name="unlock" size={14} /> Unlock
          </button>
        </span>
      )}
    </span>
  );
}
