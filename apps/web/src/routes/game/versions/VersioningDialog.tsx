import type { ReactNode } from 'react';

import { Dialog } from '../../../components/Dialog';

export function VersioningDialog({
  title,
  busy = false,
  error,
  children,
  onClose,
}: {
  title: string;
  busy?: boolean;
  error?: string;
  children: ReactNode;
  onClose(): void;
}) {
  return (
    <Dialog
      title={title}
      className="versioning-dialog"
      backdropClassName="versioning-dialog-backdrop"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {children}
      {error ? (
        <p className="versioning-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
