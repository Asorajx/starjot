import { Icon, type IconName } from './Icon';
import { closeToast, useToasts, type ToastKind } from '../lib/toasts';

const KIND_ICONS: Record<ToastKind, IconName> = { info: 'info', success: 'check', error: 'alert-triangle', loading: 'loader' };


/* =========================
   Toaster
   ========================= */

/* The corner where toasts show (see lib/toasts.ts), newest nearest the corner. Errors are */
/* announced straight away; others politely. */
export function Toaster() {
  const toasts = useToasts();
  if (!toasts.length) return null;
  return (
    <div className="toaster" role="region" aria-label="Notifications">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`toast is-${toast.kind} ${toast.leaving ? 'is-leaving' : ''}`}
          role={toast.kind === 'error' ? 'alert' : 'status'}
        >
          <span className="toast-icon"><Icon name={toast.icon ?? KIND_ICONS[toast.kind]} size={16} /></span>
          <span className="toast-text">
            <strong>{toast.title}</strong>
            {toast.description && <small>{toast.description}</small>}
          </span>
          {toast.action && (
            <button
              type="button"
              className="btn btn-sm btn-secondary toast-action"
              onClick={() => {
                toast.action?.run();
                closeToast(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          )}
          {toast.kind !== 'loading' && (
            <button type="button" className="toast-close" aria-label="Close" onClick={() => closeToast(toast.id)}>
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
