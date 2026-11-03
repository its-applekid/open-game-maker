import type { Build } from '@ogm/contracts/browser';

import type { VersionBranch } from './rules';

export function VersionRow({
  branch,
  build,
  current,
  mainBranchId,
  buildStatusUnavailable,
  onOpen,
  onArchive,
  onMerge,
}: {
  branch: VersionBranch;
  build?: Build;
  current: boolean;
  mainBranchId?: string;
  buildStatusUnavailable?: boolean;
  onOpen(branchId: string, mode?: 'play' | 'edit'): void;
  onArchive(branch: VersionBranch): void;
  onMerge(sourceBranchId: string, targetBranchId: string): void;
}) {
  const active = branch.status === 'active';
  const main = branch.name === 'main';
  return (
    <article className="version-row" aria-current={current ? 'true' : undefined} aria-label={`${branch.name} version`}>
      <header>
        <div>
          <h2>{branch.name}</h2>
          <p className="version-number">{branch.version}</p>
        </div>
        <div className="version-row-badges">
          {current ? <span>Current</span> : null}
          <span>{branch.status}</span>
          <span>{buildStatusUnavailable ? 'Build unavailable' : (build?.status ?? 'No build')}</span>
        </div>
      </header>
      {!main && active ? <p className="version-builder-note">Builders work on the main version</p> : null}
      {active ? (
        <div className="version-row-actions">
          <button className="tap-primary" type="button" onClick={() => onOpen(branch.id)}>
            Switch to {branch.name}
          </button>
          <button className="tap-primary" type="button" onClick={() => onOpen(branch.id, 'play')}>
            Play {branch.name}
          </button>
          <button className="tap-primary" type="button" onClick={() => onOpen(branch.id, 'edit')}>
            Edit {branch.name}
          </button>
          {!main ? (
            <button className="tap-secondary" type="button" onClick={() => onArchive(branch)}>
              Archive {branch.name}
            </button>
          ) : null}
          {!main && mainBranchId !== undefined ? (
            <>
              <button className="tap-secondary" type="button" onClick={() => onMerge(branch.id, mainBranchId)}>
                Bring {branch.name} into main
              </button>
              <button className="tap-secondary" type="button" onClick={() => onMerge(mainBranchId, branch.id)}>
                Bring main into {branch.name}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
