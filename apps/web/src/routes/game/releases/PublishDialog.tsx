import { useEffect, useState, type FormEvent } from 'react';

import { ApiError } from '../../../lib/api/client';
import { VersioningDialog } from '../versions/VersioningDialog';
import { publishRelease, refreshReleaseData, usePublishPreview } from './api';
import { changelogText, releaseErrorMessage } from './rules';

export function PublishDialog({
  gameId,
  buildId,
  publicRepo,
  onPublished,
  onClose,
}: {
  gameId: string;
  buildId: string;
  publicRepo: boolean;
  onPublished(): void;
  onClose(): void;
}) {
  const preview = usePublishPreview(gameId, buildId);
  const [text, setText] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState<string>();

  useEffect(() => {
    if (initialized || preview.data === undefined) return;
    setText(changelogText(preview.data.changelog));
    setInitialized(true);
  }, [initialized, preview.data]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (preview.data === undefined || text.trim() === '') return;
    setBusy(true);
    setWriteError(undefined);
    try {
      await publishRelease(gameId, buildId, { summary: text.trim(), items: [] });
      onPublished();
    } catch (error) {
      const message = releaseErrorMessage(error);
      if (error instanceof ApiError && error.status === 409) {
        await refreshReleaseData(gameId);
        setWriteError(`${message} Review the current release and try again.`);
      } else {
        setWriteError(message);
      }
      setBusy(false);
    }
  };

  const version = preview.data?.version;
  const error = writeError ?? (preview.isError ? releaseErrorMessage(preview.error, 'Preview unavailable') : undefined);
  return (
    <VersioningDialog
      title={version === undefined ? 'Publish' : `Publish ${version}`}
      busy={busy}
      error={error}
      onClose={onClose}
    >
      <form className="versioning-dialog-form" onSubmit={(event) => void submit(event)}>
        {preview.isPending ? <p>Preparing changelog…</p> : null}
        <label>
          What changed
          <textarea
            rows={8}
            disabled={preview.data === undefined || busy}
            value={text}
            onChange={(event) => setText(event.currentTarget.value)}
          />
        </label>
        {publicRepo ? <p className="release-public-note">These words will be public.</p> : null}
        <div className="versioning-dialog-actions">
          <button className="tap-secondary" type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            className="tap-primary"
            type="submit"
            disabled={preview.data === undefined || busy || text.trim() === ''}
          >
            {busy ? 'Publishing…' : version === undefined ? 'Publish' : `Publish ${version}`}
          </button>
        </div>
      </form>
    </VersioningDialog>
  );
}
