import { useState } from 'react';

import type { Release } from '@ogm/contracts/browser';

import { ApiError } from '../../../lib/api/client';
import { VersioningDialog } from '../versions/VersioningDialog';
import { refreshReleaseData, rollbackRelease, useRollbackPreview } from './api';
import { releaseErrorMessage } from './rules';

export function RollbackDialog({
  gameId,
  release,
  onRolledBack,
  onClose,
}: {
  gameId: string;
  release: Release;
  onRolledBack(): void;
  onClose(): void;
}) {
  const preview = useRollbackPreview(gameId, release.id);
  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState<string>();

  const confirm = async () => {
    if (preview.data === undefined) return;
    setBusy(true);
    setWriteError(undefined);
    try {
      await rollbackRelease(gameId, release.id);
      onRolledBack();
    } catch (error) {
      const message = releaseErrorMessage(error, 'Rollback failed');
      if (error instanceof ApiError && error.status === 409) {
        await refreshReleaseData(gameId);
        setWriteError(`${message} Review the current release and try again.`);
      } else {
        setWriteError(message);
      }
      setBusy(false);
    }
  };

  const count = preview.data?.affectedSaves;
  const error = writeError ?? (preview.isError ? releaseErrorMessage(preview.error, 'Preview unavailable') : undefined);
  return (
    <VersioningDialog title={`Restore ${release.version}?`} busy={busy} error={error} onClose={onClose}>
      {preview.isPending ? <p>Checking saves…</p> : null}
      {preview.data && count === null ? <p>Save impact could not be counted.</p> : null}
      {typeof count === 'number' ? (
        <p>
          {count} {count === 1 ? 'save' : 'saves'} will stop loading until you publish again.
        </p>
      ) : null}
      <div className="versioning-dialog-actions">
        <button className="tap-secondary" type="button" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="tap-primary"
          type="button"
          disabled={preview.data === undefined || busy}
          onClick={() => void confirm()}
        >
          {busy ? 'Rolling back…' : `Roll back to ${release.version}`}
        </button>
      </div>
    </VersioningDialog>
  );
}
