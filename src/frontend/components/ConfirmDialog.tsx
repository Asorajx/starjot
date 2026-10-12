import { useEffect, useRef, type ReactNode } from 'react';
import { useEscape } from '../lib/useDismiss';

type ConfirmDialogProps = {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};


/* =========================
   Confirm Dialog
   ========================= */

/* A centred question with Cancel and confirm buttons, shown over a dimmed page. */
/* Cancel is focused first, so pressing Enter by accident never confirms a removal. */
export function ConfirmDialog({ title, children, confirmLabel, danger = false, onConfirm, onCancel }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => cancelRef.current?.focus(), []);

  /* Escape cancels, without the note editor also handling it. */
  useEscape(true, onCancel);

  return (
    <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title">
        <h2 id="dialog-title">{title}</h2>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">
          <button ref={cancelRef} type="button" className="btn btn-quiet" onClick={onCancel}>Cancel</button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
