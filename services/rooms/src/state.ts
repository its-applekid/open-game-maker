import { schema, t, type SchemaType } from '@colyseus/schema';
import {
  PROTOCOL_VERSION,
  type Membership,
  type Phase,
  type Presence,
  type RoomPin,
  type RoomState,
} from '@ogm/contracts';

export const PinState = schema(
  {
    gameId: t.string().default(''),
    branchId: t.string().default(''),
    buildId: t.string().default(''),
  },
  'PinState',
);
export type PinState = SchemaType<typeof PinState>;

export const MembershipState = schema(
  {
    userId: t.string().default(''),
    name: t.string().default(''),
    role: t.string<Membership['role']>().default('player'),
    playerIndex: t.uint8().default(0),
    connected: t.boolean().default(false),
    sessions: t.array('string'),
  },
  'MembershipState',
);
export type MembershipState = SchemaType<typeof MembershipState>;

export const CursorState = schema(
  {
    x: t.number().default(0),
    y: t.number().default(0),
  },
  'CursorState',
);
export type CursorState = SchemaType<typeof CursorState>;

export const CameraState = schema(
  {
    pos: t.array('number'),
    target: t.array('number'),
    zoom: t.number().default(0),
  },
  'CameraState',
);
export type CameraState = SchemaType<typeof CameraState>;

export const BuildingState = schema(
  {
    jobId: t.string().default(''),
    label: t.string().default(''),
    pct: t.number().default(0),
  },
  'BuildingState',
);
export type BuildingState = SchemaType<typeof BuildingState>;

export const PresenceState = schema(
  {
    cursor: t.ref(CursorState).optional(),
    selection: t.array('string'),
    focusControlId: t.string().optional(),
    camera: t.ref(CameraState).optional(),
    privateMode: t.boolean().default(false),
    building: t.ref(BuildingState).optional(),
  },
  'PresenceState',
);
export type PresenceState = SchemaType<typeof PresenceState>;

export const DraftState = schema(
  {
    buildId: t.string().default(''),
    url: t.string().default(''),
    expiresAt: t.number().default(0),
  },
  'DraftState',
);
export type DraftState = SchemaType<typeof DraftState>;

export const GameRoomState = schema(
  {
    protocol: t.uint8().default(PROTOCOL_VERSION),
    pin: t.ref(PinState),
    ownerId: t.string().default(''),
    editorSessionId: t.string().optional(),
    phase: t.string<Phase>().default('editing'),
    phaseAt: t.number().default(() => Date.now()),
    playRev: t.number().default(0),
    lastRev: t.number().default(0),
    maxPlayers: t.uint8().default(1),
    members: t.map(MembershipState),
    presence: t.ref(PresenceState),
    draft: t.ref(DraftState).optional(),
  },
  'GameRoomState',
);
export type GameRoomState = SchemaType<typeof GameRoomState>;

export function createRoomState(input: { pin: RoomPin; ownerId: string; maxPlayers: number }): GameRoomState {
  const state = new GameRoomState();
  state.pin.gameId = input.pin.gameId;
  state.pin.branchId = input.pin.branchId;
  state.pin.buildId = input.pin.buildId;
  state.ownerId = input.ownerId;
  state.maxPlayers = input.maxPlayers;
  return state;
}

export function setPresence(target: PresenceState, source: Presence): void {
  target.selection.clear();
  target.selection.push(...source.selection);
  target.privateMode = source.privateMode;
  target.focusControlId = source.focusControlId;

  target.cursor = source.cursor
    ? Object.assign(new CursorState(), { x: source.cursor.x, y: source.cursor.y })
    : undefined;

  if (source.camera) {
    const camera = new CameraState();
    camera.pos.push(...source.camera.pos);
    camera.target.push(...source.camera.target);
    camera.zoom = source.camera.zoom;
    target.camera = camera;
  } else {
    target.camera = undefined;
  }

  target.building = source.building ? Object.assign(new BuildingState(), source.building) : undefined;
}

export function roomStateJson(state: GameRoomState): RoomState {
  return state.toJSON() as unknown as RoomState;
}
