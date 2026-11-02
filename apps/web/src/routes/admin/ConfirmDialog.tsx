import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function ConfirmDialog({
  title,
  children,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  onConfirm(): void;
  onCancel(): void;
}) {
  return createPortal(
    <div className="admin-dialog-backdrop">
      <section aria-labelledby="admin-dialog-title" aria-modal="true" className="admin-dialog" role="alertdialog">
        <h2 id="admin-dialog-title">{title}</h2>
        <div>{children}</div>
        <div className="admin-dialog-actions">
          <button className="admin-secondary tap-secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="admin-danger tap-primary" type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
