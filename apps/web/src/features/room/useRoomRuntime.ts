import { useCallback, useEffect, useRef, useState } from 'react';

import { apply, type DesignDoc, type Patch } from '@ogm/design-log/browser';
import type { Envelope, ServerMessage } from '@ogm/contracts';

import { api } from '../../lib/api/client';
import { createRoomConnection, type RoomConnection } from '../../net';
import { roomGrantState, storeRoomGrant, type RoomGrant } from '../../routes/join/grant-store';
import type { GameFrameController } from '../editor/frame';
import { fromRoomClient, type RoomSession, type RoomSessionSnapshot } from './session';
import { fakeSession, type FakeRoomSession } from './testing/fake-session';

type RoomFrame = Pick<GameFrameController, 'sendRoomMessage'>;

type UseRoomRuntimeOptions = {
  frame?: RoomFrame;
  roomId?: string;
  testMode: boolean;
};

export type RoomRuntime = {
  session?: RoomSession;
  snapshot?: RoomSessionSnapshot;
  handleGameMessage(envelope: Envelope<string, unknown>): void;
};

const joiningSnapshot: RoomSessionSnapshot = { status: 'connecting', members: {} };
const missingGrantSnapshot: RoomSessionSnapshot = {
  status: 'rejected',
  rejection: { code: 'GRANT_INVALID' },
  members: {},
};

export function useRoomRuntime({ frame, roomId, testMode }: UseRoomRuntimeOptions): RoomRuntime {
  const connectionRef = useRef<RoomConnection | undefined>(undefined);
  const fakeRef = useRef<FakeRoomSession | undefined>(undefined);
  const [grantVersion, setGrantVersion] = useState(0);
  const [session, setSession] = useState<RoomSession>();
  const [snapshot, setSnapshot] = useState<RoomSessionSnapshot>();

  const handleGameMessage = useCallback((envelope: Envelope<string, unknown>) => {
    connectionRef.current?.forwarding.handleGameMessage(envelope);
  }, []);

  useEffect(() => {
    if (roomId === undefined) {
      if (!testMode) {
        fakeRef.current = undefined;
        setSession(undefined);
        setSnapshot(undefined);
        return;
      }
      const fake = fakeRef.current ?? fakeSession();
      fakeRef.current = fake;
      setSession(fake);
      const uninstall = installFakeHandle(fake, frame);
      return uninstall;
    }

    fakeRef.current = undefined;
    if (frame === undefined) {
      setSession(undefined);
      setSnapshot(joiningSnapshot);
      return;
    }

    const grant = roomGrantState();
    if (grant === null || grant.roomId !== roomId) {
      setSession(undefined);
      setSnapshot(joiningSnapshot);
      let active = true;
      void api<Omit<RoomGrant, 'expiresAt'>>(`/rooms/${encodeURIComponent(roomId)}/grant`)
        .then((fresh) => {
          if (!active || fresh.roomId !== roomId) return;
          storeRoomGrant(fresh);
          setGrantVersion((version) => version + 1);
        })
        .catch(() => {
          if (active) setSnapshot(missingGrantSnapshot);
        });
      return () => {
        active = false;
      };
    }

    const connection = createRoomConnection({
      roomsUrl: grant.roomsUrl,
      bridge: { send: (envelope) => frame.sendRoomMessage(envelope) },
    });
    const nextSession = fromRoomClient(roomId, connection.client);
    connectionRef.current = connection;
    setSession(nextSession);
    void connection.client.join({ roomId, grant: grant.grant, pin: grant.pin, expiresAt: grant.expiresAt });

    return () => {
      if (connectionRef.current === connection) connectionRef.current = undefined;
      void connection.destroy().catch(() => undefined);
    };
  }, [frame, grantVersion, roomId, testMode]);

  useEffect(() => {
    if (session === undefined) return;
    const publish = () => setSnapshot(session.snapshot());
    publish();
    return session.subscribe(publish);
  }, [session]);

  return { session, snapshot, handleGameMessage };
}

type FakeHandle = {
  state(): RoomSessionSnapshot;
  play(): void;
  edit(): void;
  leave(): Promise<void>;
  fake: {
    emit(message: ServerMessage): void;
    setState(state: Partial<RoomSessionSnapshot>): void;
    sent(): ReturnType<FakeRoomSession['sent']>;
  };
};

type HostWithRoom = NonNullable<Window['__ogmHost']> & { room?: FakeHandle };

function installFakeHandle(session: FakeRoomSession, frame?: RoomFrame): () => void {
  const host = window.__ogmHost as HostWithRoom | undefined;
  if (host === undefined) return () => undefined;
  const previous = host.room;
  let document: DesignDoc = { schemaVersion: 1, globals: {}, entities: {} };
  let sequence = 0;
  const sendApply = (rev: number, patches: Patch[]) => {
    sequence += 1;
    frame?.sendRoomMessage({
      v: 1,
      id: `fake-room-design-${sequence}`,
      t: 'design.apply',
      payload: { rev, doc: document, patches },
    });
  };
  const handle: FakeHandle = {
    state: () => session.snapshot(),
    play: () => session.send({ t: 'phase', to: 'playing' }),
    edit: () => session.send({ t: 'phase', to: 'editing' }),
    leave: () => session.leave(),
    fake: {
      emit: (message) => {
        session.emit(message);
        if (message.t === 'welcome') {
          sendApply(message.state.lastRev, []);
        } else if (message.t === 'design.tx' && frame !== undefined) {
          const patches = normalizePatches(message.tx.patches);
          document = apply(document, patches);
          sendApply(message.tx.rev, patches);
        }
      },
      setState: (state) => session.setState(state),
      sent: () => session.sent(),
    },
  };
  host.room = handle;
  return () => {
    if (host.room !== handle) return;
    if (previous === undefined) delete host.room;
    else host.room = previous;
  };
}

function normalizePatches(patches: Extract<ServerMessage, { t: 'design.tx' }>['tx']['patches']): Patch[] {
  return patches.map((patch) => ({
    ...patch,
    path: Array.isArray(patch.path)
      ? patch.path
      : patch.path
          .slice(1)
          .split('/')
          .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~')),
  }));
}
