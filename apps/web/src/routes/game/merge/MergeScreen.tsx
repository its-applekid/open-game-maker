import { useQuery } from '@tanstack/react-query';
import { useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';

import { acquireLease, getDesignSnapshot, listJobs, releaseLease } from '../../../features/editor/api';
import { useDock } from '../../../features/build-chat/dock';
import { ApiError } from '../../../lib/api/client';
import { VersioningDialog } from '../versions/VersioningDialog';
import {
  abandonMerge,
  landMerge,
  previewMerge,
  resolveAllMergeConflicts,
  resolveMergeConflict,
  startMerge,
  useMergePlan,
  type MergePreview,
} from './api';
import { ConflictCard } from './ConflictCard';
import {
  allMine,
  canLand,
  canPreview,
  initialResolutions,
  reduceResolutions,
  type ConflictResolution,
} from './resolution';
import { FramePreview } from './SideBySide';
import '../versions/versioning.css';
import './merge.css';

export function MergeScreen() {
  const { gameId = '', planId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sourceId = searchParams.get('source') ?? '';
  const targetId = searchParams.get('target') ?? '';
  const startingRef = useRef(false);
  const [startError, setStartError] = useState<string>();
  const planQuery = useMergePlan(gameId, targetId, planId ?? '');
  const plan = planQuery.data;
  const mine = useQuery({
    queryKey: ['game', gameId, 'merge-snapshot', plan?.targetBranchId],
    queryFn: () => getDesignSnapshot(gameId, plan!.targetBranchId),
    enabled: plan !== undefined && plan.conflicts.length > 0,
  });
  const theirs = useQuery({
    queryKey: ['game', gameId, 'merge-snapshot', plan?.sourceBranchId],
    queryFn: () => getDesignSnapshot(gameId, plan!.sourceBranchId),
    enabled: plan !== undefined && plan.conflicts.length > 0,
  });
  const jobs = useQuery({
    queryKey: ['game-jobs', gameId],
    queryFn: () => listJobs(gameId),
    enabled: gameId !== '' && typeof plan?.code === 'object',
  });
  const [resolutions, dispatch] = useReducer(reduceResolutions, {});
  const [pendingResolutions, setPendingResolutions] = useState(0);
  const [activeConflict, setActiveConflict] = useState(0);
  const [preview, setPreview] = useState<MergePreview>();
  const [previewBusy, setPreviewBusy] = useState(false);
  const [landBusy, setLandBusy] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [abandonBusy, setAbandonBusy] = useState(false);
  const gamePath = `/g/${encodeURIComponent(gameId)}`;

  useEffect(() => {
    if (planId !== undefined || sourceId === '' || targetId === '' || startingRef.current) return;
    startingRef.current = true;
    void startMerge(gameId, targetId, sourceId)
      .then((created) => {
        const query = new URLSearchParams({ target: created.targetBranchId });
        navigate(`${gamePath}/merge/${encodeURIComponent(created.id)}?${query}`, { replace: true });
      })
      .catch((error: unknown) => {
        setStartError(mergeErrorMessage(error));
        startingRef.current = false;
      });
  }, [gameId, gamePath, navigate, planId, sourceId, targetId]);

  useEffect(() => {
    if (plan === undefined) return;
    dispatch({ type: 'replace', resolutions: initialResolutions(plan.conflicts) });
    setActiveConflict((index) => Math.min(index, Math.max(0, plan.conflicts.length - 1)));
  }, [plan]);

  const resolveOne = async (conflictId: string, resolution: ConflictResolution) => {
    if (plan === undefined || planId === undefined) return;
    dispatch({ type: 'set', conflictId, resolution });
    setPreview(undefined);
    setActionError(undefined);
    setPendingResolutions((count) => count + 1);
    try {
      await resolveMergeConflict(gameId, plan.targetBranchId, planId, conflictId, resolution);
    } catch (error) {
      setActionError(mergeErrorMessage(error));
      await planQuery.refetch();
    } finally {
      setPendingResolutions((count) => count - 1);
    }
  };

  const keepAllMine = async () => {
    if (plan === undefined || planId === undefined) return;
    dispatch({ type: 'replace', resolutions: allMine(plan.conflicts) });
    setPreview(undefined);
    setActionError(undefined);
    setPendingResolutions((count) => count + 1);
    try {
      await resolveAllMergeConflicts(gameId, plan.targetBranchId, planId, 'ours');
    } catch (error) {
      setActionError(mergeErrorMessage(error));
      await planQuery.refetch();
    } finally {
      setPendingResolutions((count) => count - 1);
    }
  };

  const buildPreview = async () => {
    if (plan === undefined || planId === undefined) return;
    setPreviewBusy(true);
    setActionError(undefined);
    try {
      setPreview(await previewMerge(gameId, plan.targetBranchId, planId));
      await planQuery.refetch();
    } catch (error) {
      setActionError(mergeErrorMessage(error));
    } finally {
      setPreviewBusy(false);
    }
  };

  const land = async () => {
    if (plan === undefined || planId === undefined) return;
    setLandBusy(true);
    setActionError(undefined);
    const sessionId = globalThis.crypto.randomUUID();
    const lease = await acquireLease(gameId, plan.targetBranchId, sessionId);
    if (!lease.ok) {
      setActionError('Could not acquire the target version lease.');
      setLandBusy(false);
      return;
    }
    let landed = false;
    try {
      await landMerge(gameId, plan.targetBranchId, planId, { sessionId, token: lease.lease.token });
      landed = true;
    } catch (error) {
      setActionError(mergeErrorMessage(error));
      await planQuery.refetch();
    } finally {
      await releaseLease(gameId, plan.targetBranchId, sessionId, lease.lease.token);
      setLandBusy(false);
    }
    if (landed) navigate(`${gamePath}?v=${encodeURIComponent(plan.targetBranchId)}`);
  };

  const abandon = async () => {
    if (plan === undefined || planId === undefined || abandonBusy) return;
    setAbandonBusy(true);
    setActionError(undefined);
    try {
      await abandonMerge(gameId, plan.targetBranchId, planId);
      navigate(`${gamePath}/versions?v=${encodeURIComponent(plan.targetBranchId)}`);
    } catch (error) {
      setActionError(mergeErrorMessage(error));
      setAbandonBusy(false);
      setConfirmAbandon(false);
    }
  };

  if (planId === undefined) {
    if (sourceId === '' || targetId === '') return <MergeState error="Choose two versions to merge." />;
    return <MergeState error={startError} label="Starting merge…" />;
  }
  if (targetId === '') return <MergeState error="Merge target missing." />;
  if (planQuery.isPending) return <MergeState label="Loading merge…" />;
  if (planQuery.isError || plan === undefined) {
    return <MergeState error={mergeErrorMessage(planQuery.error)} onRetry={() => void planQuery.refetch()} />;
  }

  const conflict = plan.conflicts[activeConflict];
  const codeJobId = typeof plan.code === 'object' ? plan.code.conflictJobId : undefined;
  const codeJob = jobs.data?.jobs.find(({ id }) => id === codeJobId);
  const choicesLocked = plan.status === 'previewing' || plan.status === 'landed' || plan.status === 'abandoned';
  const previewEnabled =
    pendingResolutions === 0 && codeJobId === undefined && canPreview(plan, resolutions) && !previewBusy;
  const landEnabled = codeJobId === undefined && canLand(plan) && !landBusy;

  return (
    <section className="versioning-screen merge-screen" aria-labelledby="merge-title">
      <header className="versioning-head">
        <button
          className="back tap-primary"
          type="button"
          onClick={() => navigate(`${gamePath}/versions?v=${encodeURIComponent(plan.targetBranchId)}`)}
        >
          Back
        </button>
        <h1 id="merge-title">Merge versions</h1>
        <span>{plan.status}</span>
      </header>
      <div className="versioning-body merge-body">
        <section className="merge-summary" aria-label="Merge summary">
          <p>{plan.auto.length} automatic changes</p>
          <p>{plan.conflicts.length} conflicts</p>
          <p>{codeJobId === undefined ? `Code ${plan.code}` : 'Code needs work'}</p>
        </section>

        {codeJobId !== undefined ? (
          <section className="merge-code-conflict" role="alert">
            <p>The code build needs attention before this merge can land.</p>
            {jobs.isError ? (
              <p>
                Conflict build unavailable.{' '}
                <button type="button" onClick={() => void jobs.refetch()}>
                  Try again
                </button>
              </p>
            ) : null}
            <button
              className="tap-primary"
              type="button"
              disabled={codeJob === undefined}
              onClick={() => useDock.getState().openChat(codeJobId, jobs.data?.jobs ?? [])}
            >
              Open conflict build
            </button>
          </section>
        ) : null}

        {plan.conflicts.length > 0 && (mine.isError || theirs.isError) ? (
          <p className="versioning-state" role="alert">
            Comparison unavailable.{' '}
            <button type="button" onClick={() => void Promise.all([mine.refetch(), theirs.refetch()])}>
              Try again
            </button>
          </p>
        ) : conflict && mine.data && theirs.data ? (
          <>
            <div className="merge-conflict-progress">
              <span>
                Conflict {activeConflict + 1} of {plan.conflicts.length}
              </span>
              <div>
                <button
                  className="tap-secondary"
                  type="button"
                  disabled={activeConflict === 0}
                  onClick={() => setActiveConflict((index) => index - 1)}
                >
                  Previous conflict
                </button>
                <button
                  className="tap-secondary"
                  type="button"
                  disabled={activeConflict >= plan.conflicts.length - 1}
                  onClick={() => setActiveConflict((index) => index + 1)}
                >
                  Next conflict
                </button>
              </div>
            </div>
            <ConflictCard
              conflict={conflict}
              gameId={gameId}
              mine={mine.data}
              theirs={theirs.data}
              resolution={resolutions[conflict.id]}
              disabled={choicesLocked || pendingResolutions > 0}
              onResolve={(resolution) => void resolveOne(conflict.id, resolution)}
            />
          </>
        ) : plan.conflicts.length > 0 ? (
          <p className="versioning-state">Loading comparison…</p>
        ) : (
          <p className="versioning-state">No design conflicts.</p>
        )}

        {preview ? (
          <section className="merge-preview-result" aria-label="Merge preview">
            <h2>Preview ready</h2>
            <FramePreview
              label="Preview"
              gameId={gameId}
              snapshot={{ buildId: preview.previewBuildId, rev: preview.rev, doc: preview.doc }}
            />
          </section>
        ) : null}

        {actionError ? (
          <p className="versioning-dialog-error" role="alert">
            {actionError}
          </p>
        ) : null}
        <div className="merge-actions">
          <button
            className="tap-primary"
            type="button"
            disabled={choicesLocked || plan.conflicts.length === 0 || pendingResolutions > 0}
            onClick={() => void keepAllMine()}
          >
            Keep all of mine
          </button>
          <button className="tap-primary" type="button" disabled={!previewEnabled} onClick={() => void buildPreview()}>
            {previewBusy ? 'Building preview…' : 'Preview'}
          </button>
          <button className="tap-primary" type="button" disabled={!landEnabled} onClick={() => void land()}>
            {landBusy ? 'Landing…' : 'Land'}
          </button>
          <button className="tap-secondary" type="button" onClick={() => setConfirmAbandon(true)}>
            Abandon
          </button>
        </div>
      </div>

      {confirmAbandon ? (
        <VersioningDialog title="Abandon merge?" busy={abandonBusy} onClose={() => setConfirmAbandon(false)}>
          <p>Your versions stay unchanged.</p>
          <div className="versioning-dialog-actions">
            <button
              className="tap-secondary"
              type="button"
              disabled={abandonBusy}
              onClick={() => setConfirmAbandon(false)}
            >
              Cancel
            </button>
            <button className="tap-primary" type="button" disabled={abandonBusy} onClick={() => void abandon()}>
              {abandonBusy ? 'Abandoning…' : 'Abandon merge'}
            </button>
          </div>
        </VersioningDialog>
      ) : null}
    </section>
  );
}

function MergeState({ label, error, onRetry }: { label?: string; error?: string; onRetry?(): void }) {
  return (
    <section className="versioning-screen merge-screen" aria-label="Merge versions">
      <div className="versioning-body">
        {label ? <p className="versioning-state">{label}</p> : null}
        {error ? (
          <p className="versioning-state" role="alert">
            {error} {onRetry ? <button onClick={onRetry}>Try again</button> : null}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function mergeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (typeof error.body === 'string') return error.body;
    if (error.body !== undefined) return JSON.stringify(error.body);
  }
  return error instanceof Error ? error.message : 'Merge failed';
}
