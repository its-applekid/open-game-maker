import type { RoomSessionSnapshot } from '../../features/room/session';
import type { RoomFacts } from '../../net/diagnostics/metrics';

/**
 * The facts the overlay may show about the room. A client reads only what the room already broadcasts — its own seat,
 * the seat count, the pinned build — and never another seat's metrics: there is no telemetry channel on the relay, and a
 * debugging feature must not invent one (D-N6-1).
 *
 * `rulesetHash`, `epoch` and a v2 `seat` arrive with the room-state extensions, so each is read defensively: an absent
 * field stays absent and the overlay renders `–` instead of a fabricated zero.
 */
export function roomFacts(snapshot: RoomSessionSnapshot | undefined): RoomFacts {
  if (snapshot === undefined) return {};
  const you = snapshot.you as { seat?: unknown } | undefined;
  const seat = typeof you?.seat === 'number' ? you.seat : undefined;

  return {
    ...(snapshot.pin?.buildId === undefined ? {} : { buildId: snapshot.pin.buildId }),
    ...(snapshot.maxPlayers === undefined ? {} : { maxPlayers: snapshot.maxPlayers }),
    ...(snapshot.phase === undefined ? {} : { phase: snapshot.phase }),
    ...(seat === undefined ? {} : { seat, seats: snapshot.maxPlayers ?? seat + 1 }),
  };
}
