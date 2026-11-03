import { useState, type FormEvent } from 'react';

import { ApiError } from '../../../lib/api/client';
import { createVersion } from './api';
import { VersioningDialog } from './VersioningDialog';

export function NewVersionDialog({
  gameId,
  fromBranchId,
  suggestedNumber,
  onCreated,
  onClose,
}: {
  gameId: string;
  fromBranchId: string;
  suggestedNumber: number;
  onCreated(branchId: string): void;
  onClose(): void;
}) {
  const [name, setName] = useState(`Version ${suggestedNumber}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextName = name.trim();
    if (nextName === '') return;
    setBusy(true);
    setError(undefined);
    try {
      const created = await createVersion(gameId, { name: nextName, fromBranchId });
      onCreated(created.id);
    } catch (reason) {
      setError(versionError(reason, 'Could not create version'));
      setBusy(false);
    }
  };

  return (
    <VersioningDialog title="New version" busy={busy} error={error} onClose={onClose}>
      <form className="versioning-dialog-form" onSubmit={(event) => void submit(event)}>
        <label>
          Name
          <input value={name} maxLength={80} onChange={(event) => setName(event.currentTarget.value)} />
        </label>
        <div className="versioning-dialog-actions">
          <button className="tap-secondary" type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="tap-primary" type="submit" disabled={busy || name.trim() === ''}>
            {busy ? 'Creating…' : 'Create version'}
          </button>
        </div>
      </form>
    </VersioningDialog>
  );
}

export function versionError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (typeof error.body === 'string' && error.body !== '') return error.body;
    if (error.body !== undefined) return JSON.stringify(error.body);
  }
  return error instanceof Error ? error.message : fallback;
}
