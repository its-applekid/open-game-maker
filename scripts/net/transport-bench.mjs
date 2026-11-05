#!/usr/bin/env node
/*
 * Transport bench for the N4 transport research (issue #498): what the current WebSocket relay path costs and
 * how long a message takes over it.
 *
 *   node scripts/net/transport-bench.mjs --wire     payload sizes and per-second bandwidth for 2 and 4 seats
 *   node scripts/net/transport-bench.mjs --relay    a real two-seat relay measured over loopback WebSockets
 *   node scripts/net/transport-bench.mjs --select   the transport-selection policy's decisions for scripted stats
 *   node scripts/net/transport-bench.mjs --all      all three
 *
 * `--wire` is arithmetic over the repository's own constants and schema shapes. `--relay` starts a WebSocket hub
 * (the room's role), two clients with the runtime's fixed-step clocks and a delaying proxy that models a WAN path;
 * every number it prints is measured, not modelled. `--select` runs the selection policy of
 * docs/plans/netcode-platform.md §6.5 over scripted transport stats and prints the expected decision for each.
 *
 * No dependency beyond Node's built-ins. Everything binds 127.0.0.1 and is closed before the process exits.
 */
import { createHash } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createTcpServer, connect } from 'node:net';

/* ----------------------------------------------------------------------------------------------------------------
 * Repository constants the bench reproduces. Keep these equal to their source of truth; `--wire` and `--relay`
 * both print the values they used so a stale copy is visible in the output.
 * -------------------------------------------------------------------------------------------------------------- */

/** packages/sdk/src/core/clock.ts — FIXED_DT = 1/60, STEP_MS = 1000/60. */
const STEP_MS = 1000 / 60;
/** packages/sdk/src/net/host.ts — `afterStep` sends a snapshot every third tick. */
const SNAPSHOT_EVERY_TICKS = 3;
/** packages/sdk/src/net/index.ts — `interpolationDelayMs: 100`, and peer.ts keeps three buffered snapshots. */
const INTERPOLATION_DELAY_MS = 100;
const SNAPSHOT_BUFFER = 3;
/** packages/contracts/src/room.ts — LIMITS. */
const LIMITS = { inputBytes: 256, snapshotBytes: 65_536, eventBytes: 16_384 };
/** services/rooms/src/game-room.ts — RATE_LIMITS.input (messages per second per session). */
const INPUT_PER_SEC = 60;
/** packages/contracts/src/bridge.ts — a snapshot is a base64 string on the bridge. */
const NET_DATA_MAX_CHARS = Math.ceil(65_536 / 3) * 4;

/* ----------------------------------------------------------------------------------------------------------------
 * Payload builders. Shapes come from packages/contracts/src/room.ts and bridge.ts; the world is a generic
 * 4-seat versus puzzle (4 boards of 10 x 20 cells plus 4 avatars) because the real game's context is private.
 * -------------------------------------------------------------------------------------------------------------- */

const encoder = new TextEncoder();

const bytes = (value) => encoder.encode(JSON.stringify(value)).byteLength;
const base64 = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64');

function inputFrame(seq, tick) {
  return { seq, tick, axes: [0, 0], buttons: 1 };
}

/** Peer -> game iframe (bridge), then game -> host app, then host app -> room. */
function inputPath(seq, tick) {
  const f = inputFrame(seq, tick);
  const bridge = { v: 1, id: `frame-${seq}`, t: 'net.input', payload: { f } };
  const roomClient = { t: 'input', f };
  const roomRelayed = { t: 'input', f: { ...f, playerIndex: 1, from: 'user-2' } };
  return { bridge: bytes(bridge), client: bytes(roomClient), relayed: bytes(roomRelayed) };
}

function world(seats) {
  const state = { tick: 0, players: {} };
  for (let seat = 0; seat < seats; seat += 1) {
    const board = [];
    for (let row = 0; row < 20; row += 1) board.push(new Array(10).fill(0));
    state.players[`p${seat}`] = { board, avatar: { p: [0, 0, 0], r: 0, pose: 'idle' }, score: 0, chain: 0 };
  }
  return state;
}

/** Host -> room -> peers: `{ seq, tick, data }` with `data` the base64 of `{ tick, state }`. */
function snapshotPath(seats) {
  const state = world(seats);
  const snapshot = { tick: 300, state };
  const data = base64(snapshot);
  return {
    raw: bytes(snapshot),
    room: bytes({ t: 'snapshot', seq: 100, tick: 300, data }),
    bridge: bytes({ v: 1, id: 'snap-100', t: 'net.snapshot', payload: { seq: 100, tick: 300, data } }),
  };
}

function eventPath() {
  const data = base64({ type: 'attack', from: 1, to: 2, round: 2, rows: 2, chain: 3 });
  const room = { t: 'event', seq: 7, data };
  return { room: bytes(room), dataChars: data.length };
}

/**
 * RFC 6455 framing on top of the JSON payload: a text frame is a 2-byte header, plus 4 fresh mask bytes when the
 * client is the sender (browsers must mask, servers must not).
 */
function frameOverhead(payloadBytes, fromClient) {
  const lengthBytes = payloadBytes < 126 ? 0 : payloadBytes < 65_536 ? 2 : 8;
  return 2 + lengthBytes + (fromClient ? 4 : 0);
}

/* ----------------------------------------------------------------------------------------------------------------
 * --wire
 * -------------------------------------------------------------------------------------------------------------- */

function wire() {
  const lines = [];
  const say = (line = '') => lines.push(line);

  say('## --wire');
  say();
  say(
    `constants: step ${STEP_MS.toFixed(2)} ms, snapshot every ${SNAPSHOT_EVERY_TICKS} ticks, interpolation ` +
      `${INTERPOLATION_DELAY_MS} ms, input cap ${INPUT_PER_SEC}/s`,
  );
  say();

  const input = inputPath(1, 300);
  const inputFrameBytes = frameOverhead(input.relayed, true);
  say('### Input frame (peer -> room -> host), 60 sends/s per peer');
  say();
  say('| segment | bytes |');
  say('| --- | --- |');
  say(`| bridge envelope (peer iframe -> host app) | ${input.bridge} |`);
  say(`| room client message (host app -> room) | ${input.client} |`);
  say(`| room message after the seat stamp (room -> host) | ${input.relayed} |`);
  say(`| WebSocket text frame carrying it (masked, client -> server) | ${input.relayed + inputFrameBytes} |`);
  say('');

  const snapshotSmall = snapshotPath(2);
  const snapshotFour = snapshotPath(4);
  say('### Snapshot (host -> room -> every peer), 20 sends/s');
  say();
  say('| world | JSON state | room message | bridge message |');
  say('| --- | --- | --- | --- |');
  say(`| 2 seats (2 x 10 x 20 board + 2 avatars) | ${snapshotSmall.raw} | ${snapshotSmall.room} | ${snapshotSmall.bridge} |`);
  say(`| 4 seats (4 x 10 x 20 board + 4 avatars) | ${snapshotFour.raw} | ${snapshotFour.room} | ${snapshotFour.bridge} |`);
  say(`| contract ceiling (${LIMITS.snapshotBytes} B before base64) | ${LIMITS.snapshotBytes} | ${Math.ceil(LIMITS.snapshotBytes / 3) * 4 + 40} | ${NET_DATA_MAX_CHARS + 96} |`);
  say('');

  const event = eventPath();
  say('### Event (reliable), 30 sends/s cap');
  say();
  say(`| room message | bytes |`);
  say('| --- | --- |');
  say(`| attack event of ${event.dataChars} base64 chars | ${event.room} |`);
  say('');

  say('### Per second on the wire, through the relay');
  say();
  say('| seats | peer -> room input | room -> host input | host -> room snapshots | room -> peers snapshots | total |');
  say('| --- | --- | --- | --- | --- | --- |');
  for (const seats of [2, 4]) {
    const peers = seats - 1;
    const inputOut = peers * INPUT_PER_SEC * (input.client + frameOverhead(input.client, true));
    const inputToHost = peers * INPUT_PER_SEC * (input.relayed + frameOverhead(input.relayed, false));
    const snapshotBody = (seats === 2 ? snapshotSmall : snapshotFour).room;
    const snapshotUp = (1000 / (SNAPSHOT_EVERY_TICKS * STEP_MS)) * (snapshotBody + frameOverhead(snapshotBody, true));
    const snapshotDown = peers * (1000 / (SNAPSHOT_EVERY_TICKS * STEP_MS)) * (snapshotBody + frameOverhead(snapshotBody, false));
    const total = inputOut + inputToHost + snapshotUp + snapshotDown;
    say(
      `| ${seats} | ${kb(inputOut)} | ${kb(inputToHost)} | ${kb(snapshotUp)} | ${kb(snapshotDown)} | ${kb(total)} |`,
    );
  }
  say();
  say('Totals count application bytes plus WebSocket framing, both directions as the room sees them. Not counted:');
  say('TLS record overhead (~22-40 B per record on wss), the application ping (one per 5 s today, 1 Hz while a pair');
  say('is unsettled in N4), and the reconnection handshake. A snapshot at the contract ceiling is 30x the modelled');
  say('4-seat snapshot, so those two snapshot columns would grow to about 5.0 and 1.7 MiB/s.');
  say();
  return lines.join('\n');
}

function kb(count) {
  return `${(count / 1024).toFixed(1)} KiB/s`;
}

/* ----------------------------------------------------------------------------------------------------------------
 * --relay — a real measurement: a WebSocket hub in the room's role, a peer and a host running the runtime's clocks,
 * and a delaying proxy on the peer's leg so one process can measure a WAN-shaped path.
 * -------------------------------------------------------------------------------------------------------------- */

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** A minimal RFC 6455 server: text frames only, no extensions. Stands in for Colyseus, which is not installed here. */
function wsHub(onText) {
  const sockets = new Set();
  const server = createHttpServer();
  server.on('upgrade', (request, socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    const key = request.headers['sec-websocket-key'];
    if (typeof key !== 'string') {
      socket.destroy();
      return;
    }
    const accept = createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    let buffer = Buffer.alloc(0);
    let open = true;
    const send = (text) => {
      if (!open) return;
      const payload = Buffer.from(text, 'utf8');
      let header;
      if (payload.length < 126) header = Buffer.from([0x81, payload.length]);
      else if (payload.length < 65_536) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(payload.length, 2);
      } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(payload.length), 2);
      }
      socket.write(Buffer.concat([header, payload]));
    };
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        if (buffer.length < 2) return;
        const opcode = buffer[0] & 0x0f;
        const masked = (buffer[1] & 0x80) !== 0;
        let length = buffer[1] & 0x7f;
        let offset = 2;
        if (length === 126) {
          if (buffer.length < 4) return;
          length = buffer.readUInt16BE(2);
          offset = 4;
        } else if (length === 127) {
          if (buffer.length < 10) return;
          length = Number(buffer.readBigUInt64BE(2));
          offset = 10;
        }
        const maskLength = masked ? 4 : 0;
        if (buffer.length < offset + maskLength + length) return;
        const mask = masked ? buffer.subarray(offset, offset + 4) : undefined;
        const payload = Buffer.from(buffer.subarray(offset + maskLength, offset + maskLength + length));
        if (mask) for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];
        buffer = buffer.subarray(offset + maskLength + length);
        if (opcode === 0x8) {
          open = false;
          socket.end();
          return;
        }
        if (opcode === 0x9) {
          socket.write(Buffer.from([0x8a, payload.length, ...payload]));
          continue;
        }
        if (opcode === 0x1) onText(payload.toString('utf8'), send);
      }
    });
    socket.on('close', () => {
      open = false;
    });
    socket.on('error', () => {
      open = false;
    });
  });
  return {
    server,
    listen(port = 0) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => resolve(server.address().port));
      });
    },
    close() {
      for (const socket of sockets) socket.destroy();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

/** A TCP proxy that holds every chunk for `delayMs` and, with probability `lossPct`, for a retransmit-sized stall. */
function delayProxy(targetPort, { delayMs, lossPct, seed }) {
  let random = seed >>> 0 || 1;
  const nextRandom = () => {
    random ^= random << 13;
    random ^= random >>> 17;
    random ^= random << 5;
    return ((random >>> 0) % 100_000) / 100_000;
  };
  const pairs = new Set();
  const server = createTcpServer((client) => {
    const upstream = connect(targetPort, '127.0.0.1');
    pairs.add([client, upstream]);
    const hold = (socket, chunk) => {
      const stalled = nextRandom() * 100 < lossPct;
      const wait = delayMs + (stalled ? 200 : 0);
      if (wait <= 0) {
        socket.write(chunk);
        return;
      }
      setTimeout(() => {
        if (!socket.destroyed) socket.write(chunk);
      }, wait);
    };
    client.on('data', (chunk) => hold(upstream, chunk));
    upstream.on('data', (chunk) => hold(client, chunk));
    const end = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on('error', end);
    upstream.on('error', end);
    client.on('close', end);
    upstream.on('close', end);
  });
  return {
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve(server.address().port));
      });
    },
    close() {
      for (const [client, upstream] of pairs) {
        client.destroy();
        upstream.destroy();
      }
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

function quantile(values, p) {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

/**
 * Runs the current relay pipeline once and returns the measured latencies.
 *
 * peer: fixed-step clock at 60 Hz sends one input per step (as `PeerChannel.sendFrames` does), renders 100 ms behind
 * the newest buffered snapshot (as `PeerChannel.render` does).
 * host: applies each arriving input at its next step and sends a snapshot every third tick (as `HostChannel` does).
 */
async function measureRelay({ delayMs, lossPct, seconds, seed }) {
  const started = Date.now();
  const samples = { inputToRemoteDisplay: [], selfDisplay: [], eventMs: [] };
  const counters = { inputs: 0, snapshots: 0, applied: 0 };

  // Host state: the newest input that has not been applied yet, and the newest one that has.
  let unapplied;
  let applied;
  // Peer state: its own sends by tick, its snapshot buffer, and the newest peer tick it has displayed.
  const peerSent = new Map();
  const snapshots = [];
  let displayedPeerTick = 0;

  const hub = wsHub((text) => {
    const message = JSON.parse(text);
    if (message.t === 'input') {
      counters.inputs += 1;
      unapplied = { peerTick: message.f.seq, sentAt: message.f.sentAt };
      return;
    }
    if (message.t === 'snapshot') {
      counters.snapshots += 1;
      snapshots.push({ at: Date.now(), ...message });
      while (snapshots.length > SNAPSHOT_BUFFER) snapshots.shift();
      return;
    }
    if (message.t === 'event') {
      samples.eventMs.push(Date.now() - message.sentAt);
    }
  });
  const hubPort = await hub.listen();
  const proxy = delayProxy(hubPort, { delayMs, lossPct, seed });
  const proxyPort = delayMs > 0 || lossPct > 0 ? await proxy.listen() : hubPort;

  const peerSocket = new WebSocket(`ws://127.0.0.1:${proxyPort}/`);
  const hostSocket = new WebSocket(`ws://127.0.0.1:${hubPort}/`);
  await Promise.all(
    [peerSocket, hostSocket].map(
      (socket) =>
        new Promise((resolve, reject) => {
          socket.onopen = () => resolve();
          socket.onerror = () => reject(new Error('bench socket failed to open'));
        }),
    ),
  );

  let hostTick = 0;
  let peerTick = 0;
  let running = true;

  const hostTimer = setInterval(() => {
    if (!running) return;
    hostTick += 1;
    if (unapplied !== undefined) {
      // `HostChannel.receiveInput` runs on arrival; the frame reaches the simulation at the next step.
      applied = unapplied;
      unapplied = undefined;
      counters.applied += 1;
      samples.inputToRemoteDisplay.push(Date.now() - applied.sentAt);
    }
    if (hostTick % SNAPSHOT_EVERY_TICKS !== 0) return;
    hostSocket.send(
      JSON.stringify({ t: 'snapshot', seq: hostTick, tick: hostTick, appliedPeerTick: applied?.peerTick ?? -1 }),
    );
  }, STEP_MS);

  const peerTimer = setInterval(() => {
    if (!running) return;
    peerTick += 1;
    const sentAt = Date.now();
    peerSent.set(peerTick, sentAt);
    peerSocket.send(
      JSON.stringify({ t: 'input', f: { ...inputFrame(peerTick, peerTick), playerIndex: 1, from: 'user-2', sentAt } }),
    );
    // 20 events/s, which is under the room's 30/s event cap.
    if (peerTick % 3 === 0) {
      peerSocket.send(JSON.stringify({ t: 'event', seq: peerTick, sentAt, data: 'attack' }));
    }
    // Render what was already 100 ms old: the newest buffered snapshot older than the cutoff.
    const cutoff = Date.now() - INTERPOLATION_DELAY_MS;
    const showing = snapshots.filter((entry) => entry.at <= cutoff).at(-1);
    if (showing === undefined || showing.appliedPeerTick <= displayedPeerTick) return;
    const ownSend = peerSent.get(showing.appliedPeerTick);
    // The frame drawn now shows the state that was already `interpolationDelayMs` old, so the input is first
    // visible at this step; `cutoff` is when that state was current, not when it is drawn.
    if (ownSend !== undefined) samples.selfDisplay.push(Date.now() - ownSend);
    displayedPeerTick = showing.appliedPeerTick;
    for (const tick of peerSent.keys()) if (tick < displayedPeerTick) peerSent.delete(tick);
  }, STEP_MS);

  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  running = false;
  clearInterval(hostTimer);
  clearInterval(peerTimer);
  peerSocket.close();
  hostSocket.close();
  await proxy.close();
  await hub.close();
  return {
    delayMs,
    lossPct,
    elapsedS: (Date.now() - started) / 1000,
    counters,
    inputToRemoteDisplay: summarise(samples.inputToRemoteDisplay),
    selfDisplay: summarise(samples.selfDisplay),
    eventMs: summarise(samples.eventMs),
  };
}

function summarise(values) {
  return {
    n: values.length,
    p50: quantile(values, 50),
    p95: quantile(values, 95),
    max: values.length === 0 ? Number.NaN : Math.max(...values),
  };
}

async function relay({ seconds = 6 }) {
  const lines = ['## --relay', ''];
  const say = (line = '') => lines.push(line);
  if (typeof WebSocket !== 'function') {
    say('skipped: this Node has no global WebSocket (needs Node 22+). `--wire` and `--select` still work.');
    return lines.join('\n');
  }
  say(
    `measured on this host over loopback WebSockets: peer and host each run the runtime's fixed ${STEP_MS.toFixed(1)} ms ` +
      'step, the peer sends one input per step, the host snapshots every third tick and the peer renders ' +
      `${INTERPOLATION_DELAY_MS} ms behind. "delay" is the one-way delay the proxy adds to the peer's leg, so a ` +
      '25 ms row models a 50 ms round trip. "loss" stalls that share of chunks by 200 ms, which is what a TCP ' +
      'retransmit looks like to the reader.',
  );
  say();
  say('| delay | loss | input -> remote display p50 / p95 / max | peer own input -> own display p50 / p95 / max | event p50 / p95 / max | arrivals |');
  say('| --- | --- | --- | --- | --- | --- |');
  for (const [delayMs, lossPct] of [
    [0, 0],
    [12, 0],
    [25, 0],
    [50, 0],
    [25, 2],
    [25, 10],
  ]) {
    const result = await measureRelay({ delayMs, lossPct, seconds, seed: 0x9e3779b9 });
    say(
      `| ${delayMs} ms | ${lossPct}% | ${ms(result.inputToRemoteDisplay)} | ${ms(result.selfDisplay)} | ` +
        `${ms(result.eventMs)} | ${result.counters.inputs} in / ${result.counters.snapshots} snap |`,
    );
  }
  say();
  say(
    'Both columns include the sender\'s own 60 Hz step, the host\'s next-step apply, the 20 Hz snapshot cadence and ' +
      'the 100 ms interpolation delay. The measured numbers above them are transport only; the rest is the client ' +
      'pipeline, which no transport choice changes.',
  );
  say();
  return lines.join('\n');
}

function ms(summary) {
  if (summary.n === 0) return 'none';
  return `${summary.p50.toFixed(1)} / ${summary.p95.toFixed(1)} / ${summary.max.toFixed(1)} ms (n=${summary.n})`;
}

/* ----------------------------------------------------------------------------------------------------------------
 * --select — docs/plans/netcode-platform.md §6.5, run over scripted stats.
 * -------------------------------------------------------------------------------------------------------------- */

const SELECT = {
  probeMs: 5_000,
  rttThresholdMs: 80,
  lossThresholdPct: 2,
  promoteGainPct: 30,
  demoteWindowMs: 5_000,
  demoteFactor: 2,
};

/**
 * docs/plans/netcode-platform.md §6.5 as a state machine. `current` is the transport a pair is on now:
 *
 * - on `ws-relay`: stay until `probeMs` has elapsed, then attempt WebRTC if the relay is above `rttThresholdMs` or
 *   `lossThresholdPct`.
 * - on `webrtc`: stay while the pair is better than the relay; demote when the event channel fails, the pair closes,
 *   or its RTT has been above `demoteFactor` x the relay's for `demoteWindowMs`.
 *
 * Promotion happens once, when the attempted pair reports its first RTT: `promoteGainPct` better than the relay.
 * There is no promote/hold boundary a promoted pair can flap across, because a promoted pair is only judged against
 * the demote rule.
 */
function select(current, relayStats, webrtcStats, elapsedMs, eventsOk = true) {
  if (current === 'ws-relay') {
    if (webrtcStats === undefined) {
      const bad = relayStats.rttMs > SELECT.rttThresholdMs || relayStats.lossPct > SELECT.lossThresholdPct;
      return bad && elapsedMs >= SELECT.probeMs ? 'attempt-webrtc' : 'stay-ws-relay';
    }
    return webrtcStats.rttMs <= relayStats.rttMs * (1 - SELECT.promoteGainPct / 100) ? 'promote' : 'stay-ws-relay';
  }
  if (!eventsOk) return 'demote';
  if (webrtcStats.closed) return 'demote';
  if (webrtcStats.rttMs > relayStats.rttMs * SELECT.demoteFactor && webrtcStats.windowMs >= SELECT.demoteWindowMs)
    return 'demote';
  return 'stay-webrtc';
}

function selection() {
  const lines = ['## --select', ''];
  const say = (line = '') => lines.push(line);
  say(`policy constants: ${JSON.stringify(SELECT)}`);
  say();
  say('| scenario | current | relay rtt / loss | webrtc rtt | elapsed | decision |');
  say('| --- | --- | --- | --- | --- | --- |');
  const rows = [
    ['clean LAN, relay is fine', 'ws-relay', { rttMs: 3, lossPct: 0 }, undefined, 10_000, true],
    ['probe not finished', 'ws-relay', { rttMs: 95, lossPct: 0 }, undefined, 3_000, true],
    ['WAN relay above 80 ms', 'ws-relay', { rttMs: 95, lossPct: 0 }, undefined, 10_000, true],
    ['relay loss above 2%', 'ws-relay', { rttMs: 40, lossPct: 3 }, undefined, 10_000, true],
    ['candidate exactly 30% better', 'ws-relay', { rttMs: 100, lossPct: 0 }, { rttMs: 70, windowMs: 1_000, closed: false }, 12_000, true],
    ['candidate only 20% better', 'ws-relay', { rttMs: 100, lossPct: 0 }, { rttMs: 80, windowMs: 1_000, closed: false }, 12_000, true],
    ['promoted pair runs at 0.8x relay', 'webrtc', { rttMs: 100, lossPct: 0 }, { rttMs: 80, windowMs: 5_000, closed: false }, 20_000, true],
    ['promoted pair regressed for 5 s', 'webrtc', { rttMs: 100, lossPct: 0 }, { rttMs: 240, windowMs: 5_000, closed: false }, 20_000, true],
    ['promoted pair regressed for 2 s only', 'webrtc', { rttMs: 100, lossPct: 0 }, { rttMs: 240, windowMs: 2_000, closed: false }, 20_000, true],
    ['promoted pair closed', 'webrtc', { rttMs: 100, lossPct: 0 }, { rttMs: 40, windowMs: 1_000, closed: true }, 20_000, true],
    ['event channel failed', 'webrtc', { rttMs: 100, lossPct: 0 }, { rttMs: 40, windowMs: 1_000, closed: false }, 20_000, false],
  ];
  for (const [name, current, relayStats, webrtcStats, elapsedMs, eventsOk] of rows) {
    say(
      `| ${name} | ${current} | ${relayStats.rttMs} ms / ${relayStats.lossPct}% | ` +
        `${webrtcStats === undefined ? '-' : `${webrtcStats.rttMs} ms`} | ${elapsedMs} ms | ` +
        `${select(current, relayStats, webrtcStats, elapsedMs, eventsOk)} |`,
    );
  }
  say();
  say('Expected values for `apps/web/src/net/transport/select.test.ts` come from this table; a test that disagrees with it is a policy change.');
  say();
  return lines.join('\n');
}

/* -------------------------------------------------------------------------------------------------------------- */

const argv = new Set(process.argv.slice(2));
const known = new Set(['--wire', '--relay', '--select', '--all']);
const unknown = [...argv].filter((flag) => !known.has(flag));
if (unknown.length > 0) {
  console.error(`unknown option(s): ${unknown.join(', ')}\nusage: node scripts/net/transport-bench.mjs [--wire] [--relay] [--select] [--all]`);
  process.exit(2);
}
const all = argv.size === 0 || argv.has('--all');
const sections = [];
if (all || argv.has('--wire')) sections.push(wire());
if (all || argv.has('--select')) sections.push(selection());
if (all || argv.has('--relay')) sections.push(await relay({ seconds: Number(process.env.BENCH_SECONDS ?? 6) }));
console.log(sections.join('\n'));
