import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Outlet, useNavigate, useParams, useSearchParams } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';

import type { OgmHost } from '../../app/testHook';
import {
  acquireLease,
  getDesignSnapshot,
  getGame,
  heartbeatLease,
  postTransaction,
  releaseLease,
  type DesignSnapshot,
} from '../../features/editor/api';
import { EditorChrome } from '../../features/editor/EditorChrome';
import { GizmoOverlay } from '../../features/editor/GizmoOverlay';
import { mountGameFrame, type GameFrameController, type GameFrameState } from '../../features/editor/frame';
import { LeaseController } from '../../features/editor/lease';
import { createEditorSession, type EditorSessionState } from '../../features/editor/session';
import type { SnapPrefs } from '../../features/editor/SnapPrefs';
import { connectTransactionStream } from '../../features/editor/stream';
import { createIntent } from '../../features/editor/transactions';
import { PlayEditBar } from './PlayEditBar';
import { PlatformHud } from './PlatformHud';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<GameFrameController | undefined>(undefined);
  const [frameState, setFrameState] = useState(initialFrameState);
  const [frameAttempt, setFrameAttempt] = useState(0);
  const [sessionStore, setSessionStore] = useState<StoreApi<EditorSessionState>>();
  const [sessionView, setSessionView] = useState<EditorSessionState>();
  const [canvasOptions, setCanvasOptions] = useState<{ prefab?: string; snap: SnapPrefs }>();

  useEffect(() => {
    const container = containerRef.current;
    const snapshot = design.data;
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
  }, [branch, design.data, frameAttempt, gameId, gamesOrigin]);

  useEffect(() => {
    frameRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'edit' || design.data === undefined || gameId === '') {
      setSessionStore(undefined);
      return;
    }
    const snapshot = design.data;
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
  }, [branch, design.data, gameId, mode]);

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
    revision: sessionView?.headRev ?? design.data?.rev ?? 0,
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
          <PlatformHud build="draft" frame={frameRef.current} gameId={gameId} saves={frameState.manifest.saves} />
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
