import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Outlet, useNavigate, useParams, useSearchParams } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';

import type { ReapplyReport } from '@ogm/contracts';

import type { OgmHost } from '../../app/testHook';
import {
  acquireLease,
  getDesignSnapshot,
  getGame,
  getOptionalReapply,
  heartbeatLease,
  listJobs,
  postTransaction,
  releaseLease,
  submitReapply,
  type DesignSnapshot,
} from '../../features/editor/api';
import { activeBuildStatus, inspectBuildChange } from '../../features/editor/builds';
import { EditorChrome } from '../../features/editor/EditorChrome';
import { GizmoOverlay } from '../../features/editor/GizmoOverlay';
import { mountGameFrame, type GameFrameController, type GameFrameState } from '../../features/editor/frame';
import { LeaseController } from '../../features/editor/lease';
import { ReapplyCard } from '../../features/editor/ReapplyCard';
import { createEditorSession, type EditorSessionState } from '../../features/editor/session';
import type { SnapPrefs } from '../../features/editor/SnapPrefs';
import { connectTransactionStream } from '../../features/editor/stream';
import { createIntent } from '../../features/editor/transactions';
import { pushToast } from '../../lib/notify/slice';
import { PlayEditBar } from './PlayEditBar';
import { PlatformHud } from './PlatformHud';
import { UpdateIndicator } from './UpdateIndicator';
import './game.css';

const initialFrameState: GameFrameState = { bridgeState: 'connecting', dropped: 0 };

type GameTestState = {
  bridgeState: GameFrameState['bridgeState'];
  revision: number;
  saved: string;
  mode: 'play' | 'edit';
  selection: string[];
  dropped: number;
  readOnly: boolean;
};

type TestHost = OgmHost & { game?: GameTestState };

export function GameScreen() {
  const { gameId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const branch = searchParams.get('v')?.trim() || 'main';
  const mode: 'play' | 'edit' = searchParams.get('mode') === 'edit' ? 'edit' : 'play';
  const gamesOrigin = import.meta.env.VITE_GAMES_ORIGIN ?? 'http://127.0.0.1:10000';
  const game = useQuery({ queryKey: ['game', gameId], queryFn: () => getGame(gameId), enabled: gameId !== '' });
  const design = useQuery({
    queryKey: ['design', gameId, branch],
    queryFn: () => getDesignSnapshot(gameId, branch),
    enabled: gameId !== '',
  });
  const jobs = useQuery({
    queryKey: ['game-jobs', gameId],
    queryFn: () => listJobs(gameId),
    enabled: gameId !== '',
    refetchInterval: 5_000,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<GameFrameController | undefined>(undefined);
  const [frameState, setFrameState] = useState(initialFrameState);
  const [frameAttempt, setFrameAttempt] = useState(0);
  const [sessionStore, setSessionStore] = useState<StoreApi<EditorSessionState>>();
  const [sessionView, setSessionView] = useState<EditorSessionState>();
  const [canvasOptions, setCanvasOptions] = useState<{ prefab?: string; snap: SnapPrefs }>();
  const [adopted, setAdopted] = useState<{ gameId: string; branch: string; snapshot: DesignSnapshot }>();
  const [pendingBuild, setPendingBuild] = useState<{ snapshot: DesignSnapshot; report: ReapplyReport }>();
  const inspectedBuildRef = useRef<string | undefined>(undefined);
  const activeSnapshot = adopted?.gameId === gameId && adopted.branch === branch ? adopted.snapshot : design.data;

  useEffect(() => {
    inspectedBuildRef.current = undefined;
    setPendingBuild(undefined);
  }, [branch, gameId]);

  useEffect(() => {
    const ready = jobs.data?.jobs.some((job) => job.stage === 'ready' || job.state === 'done') ?? false;
    if (!ready || activeSnapshot === undefined || gameId === '') return;
    let active = true;
    void getDesignSnapshot(gameId, branch)
      .then(async (next) => {
        if (!active || next.buildId === activeSnapshot.buildId || inspectedBuildRef.current === next.buildId) return;
        inspectedBuildRef.current = next.buildId;
        const change = await inspectBuildChange(activeSnapshot, next, () =>
          getOptionalReapply(gameId, branch, activeSnapshot.buildId, next.buildId),
        );
        if (!active) return;
        if (change.kind === 'switch') {
          setAdopted({ gameId, branch, snapshot: change.snapshot });
        } else if (change.kind === 'review') {
          setPendingBuild({ snapshot: change.snapshot, report: change.report });
        }
      })
      .catch(() => {
        inspectedBuildRef.current = undefined;
      });
    return () => {
      active = false;
    };
  }, [activeSnapshot, branch, gameId, jobs.data?.jobs]);

  useEffect(() => {
    const container = containerRef.current;
    const snapshot = activeSnapshot;
    if (container === null || snapshot === undefined || gameId === '') return;
    setFrameState(initialFrameState);
    const controller = mountGameFrame({
      container,
      gamesOrigin,
      gameId,
      buildId: snapshot.buildId,
      mode,
      design: snapshot,
      onState: setFrameState,
    });
    frameRef.current = controller;
    return () => {
      controller.dispose();
      if (frameRef.current === controller) frameRef.current = undefined;
    };
  }, [activeSnapshot, branch, frameAttempt, gameId, gamesOrigin]);

  useEffect(() => {
    frameRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'edit' || activeSnapshot === undefined || gameId === '') {
      setSessionStore(undefined);
      return;
    }
    const snapshot = activeSnapshot;
    const sessionId = globalThis.crypto.randomUUID();
    let active = true;
    let stream: ReturnType<typeof connectTransactionStream> | undefined;
    let editor: StoreApi<EditorSessionState> | undefined;
    const lease = new LeaseController({
      api: {
        acquire: () => acquireLease(gameId, branch, sessionId),
        heartbeat: (token) => heartbeatLease(gameId, branch, sessionId, token),
        release: (token) => releaseLease(gameId, branch, sessionId, token),
      },
      onLost: (holder) => void editor?.getState().loseLease(holder),
    });

    void lease.start().then(async (result) => {
      if (!active) {
        await lease.stop();
        return;
      }
      if (!result.ok) return;
      editor = createSession(gameId, branch, sessionId, result.lease.token, snapshot, frameRef);
      setSessionStore(editor);
      stream = connectTransactionStream({
        gameId,
        branch,
        after: snapshot.rev,
        receive: (transaction) => editor?.getState().receive(transaction),
      });
    });

    return () => {
      active = false;
      stream?.close();
      void lease.stop();
      setSessionStore(undefined);
    };
  }, [activeSnapshot, branch, gameId, mode]);

  useEffect(() => {
    if (sessionStore === undefined) {
      setSessionView(undefined);
      return;
    }
    setSessionView(sessionStore.getState());
    return sessionStore.subscribe((state) => setSessionView(state));
  }, [sessionStore]);

  const testState: GameTestState = {
    bridgeState: frameState.bridgeState,
    revision: sessionView?.headRev ?? activeSnapshot?.rev ?? 0,
    saved: sessionView?.saved ?? 'saved',
    mode,
    selection: sessionView?.selection ?? [],
    dropped: frameState.dropped,
    readOnly: sessionView?.readOnly ?? false,
  };
  const testStateRef = useRef(testState);
  testStateRef.current = testState;
  useEffect(() => {
    if (!searchParams.has('test') || window.__ogmHost === undefined) return;
    const host = window.__ogmHost as TestHost;
    Object.defineProperty(host, 'game', { configurable: true, get: () => testStateRef.current });
    return () => {
      delete host.game;
    };
  }, [searchParams]);

  const setMode = (nextMode: 'play' | 'edit') => {
    const next = new URLSearchParams(searchParams);
    next.set('mode', nextMode);
    setSearchParams(next, { replace: true });
  };
  const back = () => {
    frameRef.current?.dispose();
    void navigate('/games');
  };

  return (
    <section className="game-screen" aria-label="Play and edit">
      <PlayEditBar
        title={game.data?.title ?? ''}
        mode={mode}
        saved={mode === 'edit' ? savedLabel(sessionView?.saved) : undefined}
        build="draft"
        buildStatus={activeBuildStatus(jobs.data?.jobs ?? [])}
        onBack={back}
        onMode={setMode}
        onAsk={() => setMode('edit')}
      />
      <div className="game-stage">
        <div className="game-frame" ref={containerRef} />
        {mode === 'edit' &&
        frameRef.current !== undefined &&
        frameState.manifest !== undefined &&
        sessionStore !== undefined &&
        canvasOptions !== undefined ? (
          <GizmoOverlay
            activePrefab={canvasOptions.prefab}
            frame={frameRef.current}
            manifest={frameState.manifest}
            session={sessionStore}
            snap={canvasOptions.snap}
          />
        ) : null}
        {mode === 'play' && frameRef.current !== undefined && frameState.manifest !== undefined ? (
          <>
            <PlatformHud build="draft" frame={frameRef.current} gameId={gameId} saves={frameState.manifest.saves} />
            {activeSnapshot ? (
              <UpdateIndicator
                currentBuildId={activeSnapshot.buildId}
                gameId={gameId}
                onUpdate={() => window.location.reload()}
              />
            ) : null}
          </>
        ) : null}
      </div>
      {mode === 'edit' &&
      frameState.manifest !== undefined &&
      sessionView !== undefined &&
      sessionStore !== undefined ? (
        <EditorChrome
          gameId={gameId}
          manifest={frameState.manifest}
          session={sessionView}
          onCommand={(command) => {
            const state = sessionStore.getState();
            void state.submit(
              createIntent(state.doc, [command], command.op === 'invoke' ? command.command : command.control),
            );
          }}
          onTool={(tool) => sessionStore.getState().setTool(tool)}
          onUndo={() => void sessionStore.getState().undo()}
          onRedo={() => void sessionStore.getState().redo()}
          onCanvasChange={setCanvasOptions}
        />
      ) : null}
      {frameState.bridgeState === 'error' ? (
        <div className="frame-error" role="alert">
          <button className="tap-primary" type="button" onClick={() => setFrameAttempt((attempt) => attempt + 1)}>
            Try again
          </button>
        </div>
      ) : null}
      {pendingBuild ? (
        <ReapplyCard
          report={pendingBuild.report}
          onConfirm={(choices) => {
            void submitReapply(gameId, branch, choices)
              .then(() => {
                setAdopted({ gameId, branch, snapshot: pendingBuild.snapshot });
                setPendingBuild(undefined);
              })
              .catch(() => pushToast('Update failed'));
          }}
        />
      ) : null}
      <Outlet />
    </section>
  );
}

function createSession(
  gameId: string,
  branch: string,
  sessionId: string,
  leaseToken: number,
  snapshot: DesignSnapshot,
  frameRef: React.RefObject<GameFrameController | undefined>,
) {
  return createEditorSession({
    sessionId,
    leaseToken,
    snapshot,
    api: {
      postTransaction: (body) => postTransaction(gameId, branch, body),
      getSnapshot: () => getDesignSnapshot(gameId, branch),
    },
    applyDesign: (doc, patches, rev) => frameRef.current?.applyDesign(rev, doc, patches),
  });
}

function savedLabel(saved: EditorSessionState['saved'] | undefined): string {
  switch (saved) {
    case 'saving':
      return 'Saving…';
    case 'retrying':
      return 'Trying again…';
    case 'not-saved':
      return 'Not saved';
    case 'read-only':
      return 'Read only';
    default:
      return 'Saved';
  }
}
