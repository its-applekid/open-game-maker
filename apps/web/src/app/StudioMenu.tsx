import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link, matchPath, useLocation } from 'react-router';

import { JOB_STAGE_WORDS, type Job } from '@ogm/contracts/browser';

import { Icon } from '../components/Icon';
import { BugButton } from '../features/bug-report';
import { isTerminal, useMyJobs } from '../features/build-chat/jobs';
import { signOut } from '../lib/api/auth';
import { useSession } from '../lib/api/session';
import { getVolume, onChange, setMuted, setVolume, status } from '../lib/sound';
import { useAdminMe } from '../routes/admin/api';

const RECENT_BUILD_MS = 5 * 60 * 1000;

export function StudioMenu() {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const previousActive = useRef(new Map<string, Job>());
  const announcedStarts = useRef(new Set<string>());
  const location = useLocation();
  const { data: session } = useSession();
  const admin = useAdminMe(Boolean(session));
  const builds = useMyJobs();
  const sound = useSyncExternalStore(onChange, status);
  const [open, setOpen] = useState(false);
  const [volume, setLocalVolume] = useState(getVolume);
  const [announcement, setAnnouncement] = useState('');
  const game = matchPath('/g/:gameId/*', location.pathname);
  const gameId = game?.params.gameId;
  const gameTitles = useMemo(() => new Map(builds.games.map(({ id, title }) => [id, title])), [builds.games]);
  const visibleBuilds = useMemo(() => recentBuilds(builds.jobs), [builds.jobs]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  useEffect(() => {
    const next = new Map(builds.active.map((job) => [job.id, job]));
    const messages: string[] = [];
    for (const job of builds.active) {
      if (announcedStarts.current.has(job.id)) continue;
      announcedStarts.current.add(job.id);
      messages.push(`Building ${buildName(job, gameTitles)}`);
    }
    for (const [jobId, job] of previousActive.current) {
      if (!next.has(jobId)) messages.push(`Finished building ${buildName(job, gameTitles)}`);
    }
    previousActive.current = next;
    if (messages.length > 0) setAnnouncement(messages.join('. '));
  }, [builds.active, gameTitles]);

  const changeVolume = (next: number) => {
    setLocalVolume(next);
    setVolume(next);
  };
  const close = () => setOpen(false);
  const gamePath = gameId === undefined ? undefined : `/g/${encodeURIComponent(gameId)}`;

  return (
    <div ref={root} className="studio-menu-control">
      <button
        ref={trigger}
        type="button"
        className="studio-menu-button"
        data-building={builds.active.length > 0}
        aria-label="Menu"
        aria-expanded={open}
        aria-controls="studio-menu-panel"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="studio-menu-ring" aria-hidden="true" />
        <Icon name="menu" />
      </button>
      <span className="sr" role="status" aria-live="polite">
        {announcement}
      </span>
      {open ? (
        <div id="studio-menu-panel" className="studio-menu-panel" role="dialog" aria-label="Menu">
          <div className="studio-menu-volume">
            <button
              type="button"
              className="studio-menu-action"
              aria-label={sound === 'on' ? 'Mute' : 'Unmute'}
              onClick={() => setMuted(sound === 'on')}
            >
              <Icon name={sound === 'on' ? 'soundOn' : 'soundOff'} />
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              aria-label="Volume"
              value={volume}
              onChange={(event) => changeVolume(Number(event.target.value))}
            />
          </div>

          <BugButton />

          {visibleBuilds.length > 0 ? (
            <ul className="studio-menu-builds" aria-label="Build progress">
              {visibleBuilds.map((job) => (
                <li key={job.id}>
                  <Link
                    to={`/g/${encodeURIComponent(job.gameId)}?v=${encodeURIComponent(job.branchId)}`}
                    onClick={close}
                  >
                    <strong>{buildName(job, gameTitles)}</strong>
                    <span>{buildStage(job)}</span>
                    <span>{buildPercent(job)}%</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          {gamePath ? (
            <div className="studio-menu-actions">
              <MenuLink label="Versions" icon="versions" to={`${gamePath}/versions`} close={close} />
              <MenuLink label="Publish" icon="publish" to={`${gamePath}/releases?action=publish`} close={close} />
              <MenuLink label="Rollback" icon="rollback" to={`${gamePath}/releases?action=rollback`} close={close} />
            </div>
          ) : null}

          {session ? (
            <div className="studio-menu-actions">
              <MenuLink label="Credits" icon="credits" to="/settings/credits" close={close} />
              <button
                type="button"
                className="studio-menu-action"
                aria-label="Sign out"
                onClick={() => {
                  close();
                  void signOut();
                }}
              >
                <Icon name="signOut" />
              </button>
              {admin.data?.platformRole === 'maintainer' || admin.data?.platformRole === 'admin' ? (
                <MenuLink label="Admin" icon="admin" to="/admin" close={close} />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({ label, icon, to, close }: { label: string; icon: string; to: string; close(): void }) {
  return (
    <Link className="studio-menu-action" aria-label={label} to={to} onClick={close}>
      <Icon name={icon} />
    </Link>
  );
}

function recentBuilds(jobs: readonly Job[], now = Date.now()): Job[] {
  return jobs.filter((job) => {
    if (!isTerminal(job.state)) return true;
    const finishedAt = Date.parse(job.terminalAt ?? job.updatedAt);
    return Number.isFinite(finishedAt) && now - finishedAt <= RECENT_BUILD_MS;
  });
}

function buildName(job: Job, names: ReadonlyMap<string, string | undefined>): string {
  return names.get(job.gameId) ?? job.plan.title;
}

function buildStage(job: Job): string {
  if (job.stageText) return job.stageText;
  if (job.stage) return JOB_STAGE_WORDS[job.stage];
  return job.state === 'done' ? 'Ready to try' : 'Building';
}

function buildPercent(job: Job): number {
  return job.state === 'done' ? 100 : (job.progressPercent ?? 0);
}
