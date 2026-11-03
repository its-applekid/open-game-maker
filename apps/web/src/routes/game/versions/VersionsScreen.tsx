import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';

import { archiveVersion, useBuilds, useVersionBranches } from './api';
import { NewVersionDialog, versionError } from './NewVersionDialog';
import { VersioningDialog } from './VersioningDialog';
import { VersionRow } from './VersionRow';
import { canCreateVersion, type VersionBranch } from './rules';
import './versioning.css';

export function VersionsScreen() {
  const { gameId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const branches = useVersionBranches(gameId);
  const builds = useBuilds(gameId);
  const [creating, setCreating] = useState(false);
  const [archiving, setArchiving] = useState<VersionBranch>();
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<string>();
  const rows = branches.data ?? [];
  const selectedId = searchParams.get('v');
  const current = rows.find(({ id }) => id === selectedId) ?? rows.find(({ name }) => name === 'main') ?? rows[0];
  const main = rows.find(({ name }) => name === 'main');
  const activeCount = rows.filter(({ status }) => status === 'active').length;
  const gamePath = `/g/${encodeURIComponent(gameId)}`;

  const open = (branchId: string, mode?: 'play' | 'edit') => {
    const query = new URLSearchParams({ v: branchId });
    if (mode !== undefined) query.set('mode', mode);
    navigate(`${gamePath}?${query}`);
  };

  const confirmArchive = async () => {
    if (archiving === undefined) return;
    setArchiveBusy(true);
    setArchiveError(undefined);
    try {
      await archiveVersion(gameId, archiving.id);
      if (current?.id === archiving.id && main !== undefined) {
        navigate(`${gamePath}/versions?v=${encodeURIComponent(main.id)}`, { replace: true });
      }
      setArchiving(undefined);
    } catch (error) {
      setArchiveError(versionError(error, 'Could not archive version'));
    } finally {
      setArchiveBusy(false);
    }
  };

  return (
    <section className="versioning-screen" aria-labelledby="versions-title">
      <header className="versioning-head">
        <button
          className="back tap-primary"
          type="button"
          onClick={() => navigate(current ? `${gamePath}?v=${encodeURIComponent(current.id)}` : gamePath)}
        >
          Back
        </button>
        <h1 id="versions-title">Versions</h1>
        <span>{activeCount} of 5</span>
        <button
          className="tap-primary version-new"
          type="button"
          disabled={!canCreateVersion(rows) || current?.status !== 'active'}
          onClick={() => setCreating(true)}
        >
          New version from here
        </button>
      </header>

      <div className="versioning-body">
        {branches.isPending || builds.isPending ? <p className="versioning-state">Loading versions…</p> : null}
        {branches.isError || builds.isError ? (
          <p className="versioning-state" role="alert">
            Versions unavailable.{' '}
            <button type="button" onClick={() => void Promise.all([branches.refetch(), builds.refetch()])}>
              Try again
            </button>
          </p>
        ) : null}
        {!branches.isPending && !branches.isError && rows.length === 0 ? (
          <p className="versioning-state">No versions yet.</p>
        ) : null}
        {rows.length > 0 ? (
          <div className="version-list">
            {rows.map((branch) => (
              <VersionRow
                key={branch.id}
                branch={branch}
                build={builds.data?.find(({ id }) => id === branch.latestBuildId)}
                buildStatusUnavailable={builds.isError}
                current={branch.id === current?.id}
                mainBranchId={main?.id}
                onOpen={open}
                onArchive={(candidate) => {
                  setArchiveError(undefined);
                  setArchiving(candidate);
                }}
                onMerge={(source, target) => {
                  const query = new URLSearchParams({ source, target });
                  navigate(`${gamePath}/merge?${query}`);
                }}
              />
            ))}
          </div>
        ) : null}
      </div>

      {creating && current ? (
        <NewVersionDialog
          gameId={gameId}
          fromBranchId={current.id}
          suggestedNumber={activeCount + 1}
          onCreated={(branchId) => {
            setCreating(false);
            navigate(`${gamePath}/versions?v=${encodeURIComponent(branchId)}`, { replace: true });
          }}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {archiving ? (
        <VersioningDialog
          title={`Archive ${archiving.name}?`}
          busy={archiveBusy}
          error={archiveError}
          onClose={() => setArchiving(undefined)}
        >
          <p>The version stays in history.</p>
          <div className="versioning-dialog-actions">
            <button
              className="tap-secondary"
              type="button"
              disabled={archiveBusy}
              onClick={() => setArchiving(undefined)}
            >
              Cancel
            </button>
            <button className="tap-primary" type="button" disabled={archiveBusy} onClick={() => void confirmArchive()}>
              {archiveBusy ? 'Archiving…' : 'Archive version'}
            </button>
          </div>
        </VersioningDialog>
      ) : null}
    </section>
  );
}
