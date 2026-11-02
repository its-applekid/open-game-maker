import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function ConfirmDialog({
  title,
  children,
  confirmLabel = 'Confirm',
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  error?: string;
  onConfirm(): void | Promise<void>;
  onCancel(): void;
}) {
  return createPortal(
    <div className="admin-dialog-backdrop">
      <section aria-labelledby="admin-dialog-title" aria-modal="true" className="admin-dialog" role="alertdialog">
        <h2 id="admin-dialog-title">{title}</h2>
        <div>{children}</div>
        {error ? (
          <p className="admin-dialog-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="admin-dialog-actions">
          <button className="admin-secondary tap-secondary" disabled={busy} type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="admin-danger tap-primary" disabled={busy} type="button" onClick={onConfirm}>
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
