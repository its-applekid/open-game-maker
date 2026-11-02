/**
 * Two-client verify (T07 §4.5): two Playwright contexts against a scenario-owned local rooms service.
 *
 *   pnpm --filter @ogm/gm-verify scenario two-client --game <gameDir> [--out <dir>]
 *
 * Harness mode: grants are minted with `signGrant` and the room is created through the loopback internal API, so the
 * sign-in step is reported in `unchecked`. Every server binds 127.0.0.1; everything started here is stopped in
 * `finally`. Timings land in the verify report as probes; each assertion failure is the report's `error`.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { loadavg, tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALWAYS_UNCHECKED,
  ConsoleCollector,
  GM_VERIFY_VERSION,
  isSoftware,
  launch,
  newRunId,
  rendererString,
  unknownBudgets,
  verdictFor,
  writeReport,
  type VerifyReport,
} from '@ogm/gm-verify';
import { signGrant } from '@ogm/room-protocol';
import { build } from 'esbuild';
import type { Browser, BrowserContext, Page } from 'playwright';

import type {} from './two-client/harness.ts';

export type TwoClientOptions = {
  gameDir: string;
  out: string;
  softwareGl?: boolean;
  /** Rooms build to run; defaults to this repository's `services/rooms/dist`. */
  roomsDist?: string;
  log?: (line: string) => void;
};

export type TwoClientResult = { report: VerifyReport; reportPath: string; canary: CanaryEvidence };
export type CanaryEvidence = { sentFrames: number; watcherFrames: number; leaked: number };

export const LIMITS = { welcomeMs: 2_000, playSwitchMs: 500 } as const;
export const TEST_TIMINGS = { ownerReconnectSec: 2, playerReconnectSec: 1, idleDisposeSec: 5 } as const;

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = resolve(HERE, '../../..');
const PIN = { gameId: 'two-client', branchId: 'main', buildId: 'b1' } as const;
const DRAFT_BUILD = 'b2';
const OWNER = { sub: 'owner-1', name: 'Host' };
const PEER = { sub: 'player-2', name: 'Peer' };

class ScenarioFailure extends Error {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ScenarioFailure(message);
}

/** A random 24-character canary per run. */
export function newCanary(): string {
  return randomBytes(18).toString('base64url');
}

/** Counts frames whose bytes contain the canary; text and binary frames are both searched byte-wise. */
export function framesContaining(frames: readonly (string | Buffer)[], canary: string): number {
  const needle = Buffer.from(canary, 'utf8');
  return frames.filter((frame) => (typeof frame === 'string' ? Buffer.from(frame, 'utf8') : frame).includes(needle))
    .length;
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => done());
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('server has no port');
  return address.port;
}

async function freePort(): Promise<number> {
  const server = createServer();
  const port = await listen(server);
  await new Promise((done) => server.close(done));
  return port;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
};

function sendFile(response: ServerResponse, path: string): void {
  if (!existsSync(path)) {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
  response.end(readFileSync(path));
}

/**
 * Games origin: the pinned build and the draft build serve the same dist, so a draft load swaps the pin without a
 * rebuild. Any other build id is a 404, so a client that loads the wrong build fails its ready wait.
 */
function gamesServer(dist: string): Server {
  const builds = new Set<string>([PIN.buildId, DRAFT_BUILD]);
  return createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const page = /^\/g\/[^/]+\/([^/]+)\/index\.html$/.exec(path);
    if (page && builds.has(page[1]!)) return sendFile(response, join(dist, 'index.html'));
    if (path.startsWith('/assets/') && !path.includes('..')) return sendFile(response, join(dist, path));
    response.writeHead(404).end('not found');
  });
}

function appServer(dir: string): Server {
  return createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (path === '/harness.js') return sendFile(response, join(dir, 'harness.js'));
    if (path === '/') return sendFile(response, join(HERE, 'two-client', 'harness.html'));
    response.writeHead(404).end('not found');
  });
}

/** Stands in for the API's internal `ended` callback and records what the room reported. */
function endedServer(ended: { roomId: string; reason: string }[], secret: string): Server {
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    const match = /^\/internal\/rooms\/([^/]+)\/ended$/.exec(request.url ?? '');
    if (request.method !== 'POST' || !match || request.headers.authorization !== `Bearer ${secret}`) {
      response.writeHead(404).end();
      return;
    }
    let body = '';
    request.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
    request.on('end', () => {
      let reason: unknown;
      try {
        reason = (JSON.parse(body) as { reason?: unknown }).reason;
      } catch {
        response.writeHead(400).end();
        return;
      }
      ended.push({ roomId: decodeURIComponent(match[1]!), reason: String(reason) });
      response.writeHead(204).end();
    });
  });
}

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
    child.once('error', fail);
    child.once('exit', (code) =>
      code === 0 ? done() : fail(new Error(`${command} ${args.join(' ')} failed: ${stderr.trim().slice(-400)}`)),
    );
  });
}

async function startRooms(roomsDist: string, env: Record<string, string>): Promise<ChildProcess> {
  for (const file of ['server.js', 'config.js', 'lifecycle.js']) {
    const path = join(roomsDist, file);
    if (!existsSync(path)) throw new Error(`rooms build not found: ${path} (run pnpm --filter @ogm/rooms build)`);
  }
  const child = spawn(
    process.execPath,
    [join(HERE, 'two-client', 'rooms.ts'), roomsDist, JSON.stringify(TEST_TIMINGS)],
    {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let stderr = '';
  child.stderr!.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
  await new Promise<void>((done, fail) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      fail(new Error(`rooms did not start: ${stderr.slice(-400)}`));
    }, 20_000);
    child.stdout!.on('data', (chunk: Buffer) => {
      if (!chunk.toString('utf8').includes('"listening"')) return;
      clearTimeout(timer);
      done();
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      fail(new Error(`rooms exited with ${code}: ${stderr.slice(-400)}`));
    });
  });
  return child;
}

type Client = {
  context: BrowserContext;
  page: Page;
  received: (string | Buffer)[];
  sent: (string | Buffer)[];
};

async function openClient(browser: Browser, appUrl: string, collector: ConsoleCollector): Promise<Client> {
  const context = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const page = await context.newPage();
  const received: (string | Buffer)[] = [];
  const sent: (string | Buffer)[] = [];
  page.on('websocket', (socket) => {
    socket.on('framereceived', ({ payload }) => received.push(payload));
    socket.on('framesent', ({ payload }) => sent.push(payload));
  });
  page.on('pageerror', (error) => collector.add('error', error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') collector.add('error', message.text());
  });
  await page.goto(appUrl);
  await page.waitForFunction(() => window.__harness !== undefined);
  return { context, page, received, sent };
}

type JoinArgs = { roomsUrl: string; roomId: string; grant: string; buildId: string; gamesOrigin: string };

async function joinRoom(client: Client, args: JoinArgs): Promise<number> {
  await client.page.evaluate((input) => window.__harness.join(input), args);
  return client.page.evaluate(() => window.__harness.welcomeMs ?? Number.NaN);
}

async function until(page: Page, predicate: string | (() => unknown), timeoutMs: number, what: string): Promise<void> {
  try {
    await page.waitForFunction(predicate, undefined, { timeout: timeoutMs, polling: 10 });
  } catch {
    throw new ScenarioFailure(`timed out after ${timeoutMs} ms waiting for ${what}`);
  }
}

type EntitySnapshot = { playerIndex: number; p: number[] };

/** Polls from Node: `renderGameToText()` is async, and `waitForFunction` treats a returned promise as truthy. */
async function untilNode(page: Page, check: () => Promise<boolean>, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new ScenarioFailure(`timed out after ${timeoutMs} ms waiting for ${what}`);
    await page.waitForTimeout(50);
  }
}

async function playerX(page: Page, playerIndex: number): Promise<number | undefined> {
  const text = (await page.evaluate(() => window.__harness.renderGameToText())) as {
    state?: { entities?: Record<string, EntitySnapshot> };
  };
  const entity = Object.values(text.state?.entities ?? {}).find((candidate) => candidate.playerIndex === playerIndex);
  return entity?.p[0];
}

function stableId(): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const bytes = randomBytes(25);
  return `e_${'01234567'[bytes[0]! % 8]}${[...bytes.subarray(1), ...randomBytes(1)].map((byte) => alphabet[byte % 32]).join('')}`;
}

export async function runTwoClient(options: TwoClientOptions): Promise<TwoClientResult> {
  const log = options.log ?? (() => {});
  const startedAt = new Date().toISOString();
  const out = resolve(options.out);
  mkdirSync(join(out, 'steps'), { recursive: true });
  const work = mkdtempSync(join(tmpdir(), 'gm-two-client-'));
  const software = options.softwareGl ?? false;
  const consoleEntries = new ConsoleCollector();
  const probes: VerifyReport['probes'] = { loadavg1: Number(loadavg()[0]!.toFixed(2)) };
  const frames: VerifyReport['frames'] = [];
  const ended: { roomId: string; reason: string }[] = [];
  const canary = newCanary();
  const evidence: CanaryEvidence = { sentFrames: 0, watcherFrames: 0, leaked: 0 };
  const servers: Server[] = [];
  let rooms: ChildProcess | undefined;
  let browser: Browser | undefined;
  let renderer = 'unknown';
  let error: string | undefined;
  let stepStartedAt = Date.now();

  const grantSecret = randomBytes(32).toString('hex');
  const internalSecret = randomBytes(32).toString('hex');

  try {
    const gameDir = resolve(options.gameDir);
    log(`build ${gameDir}`);
    await run(
      'pnpm',
      ['exec', 'vite', 'build', '--mode', 'draft', '--outDir', join(work, 'game'), '--emptyOutDir'],
      gameDir,
    );
    await build({
      entryPoints: [join(HERE, 'two-client', 'harness.ts')],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      outfile: join(work, 'app', 'harness.js'),
      logLevel: 'silent',
    });

    const serve = (server: Server) => {
      servers.push(server);
      return listen(server);
    };
    const gamesPort = await serve(gamesServer(join(work, 'game')));
    const appPort = await serve(appServer(join(work, 'app')));
    const apiPort = await serve(endedServer(ended, internalSecret));
    const roomsPort = await freePort();
    const gamesOrigin = `http://127.0.0.1:${gamesPort}`;
    const appUrl = `http://127.0.0.1:${appPort}/`;
    const roomsUrl = `ws://127.0.0.1:${roomsPort}`;

    rooms = await startRooms(options.roomsDist ?? join(REPO, 'services', 'rooms', 'dist'), {
      OGM_ROOMS_PORT: String(roomsPort),
      OGM_WS_TOKEN_SECRET: grantSecret,
      OGM_ROOMS_INTERNAL_SECRET: internalSecret,
      OGM_API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`,
      OGM_GAMES_ORIGIN: gamesOrigin,
    });
    const createRoom = async (): Promise<string> => {
      const response = await fetch(`http://127.0.0.1:${roomsPort}/internal/rooms`, {
        method: 'POST',
        headers: { authorization: `Bearer ${internalSecret}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ...PIN, ownerId: OWNER.sub, maxPlayers: 4 }),
      });
      assert(response.status === 201, `room creation returned ${response.status}`);
      return ((await response.json()) as { roomId: string }).roomId;
    };
    const grant = (roomId: string, who: typeof OWNER, role: 'owner' | 'player') =>
      signGrant({ ...who, roomId, gameId: PIN.gameId, role }, grantSecret);
    const joinArgs = (roomId: string, token: string): JoinArgs => ({
      roomsUrl,
      roomId,
      grant: token,
      buildId: PIN.buildId,
      gamesOrigin,
    });
    const shoot = async (step: number, clients: [string, Client][]) => {
      for (const [role, client] of clients) {
        const path = `steps/${step}-${role}.png`;
        await client.page.screenshot({ path: join(out, path) });
        frames.push({ t: (Date.now() - stepStartedAt) / 1000, path, viewport: 'desktop' });
      }
    };

    browser = await launch(software);
    const host = await openClient(browser, appUrl, consoleEntries);
    const peer = await openClient(browser, appUrl, consoleEntries);
    renderer = await rendererString(host.page);
    stepStartedAt = Date.now();
    const roomId = await createRoom();

    log('1 create room, invite, join, welcome');
    await joinRoom(host, joinArgs(roomId, await grant(roomId, OWNER, 'owner')));
    const welcomeMs = await joinRoom(peer, joinArgs(roomId, await grant(roomId, PEER, 'player')));
    probes.welcomeMs = Math.round(welcomeMs);
    assert(welcomeMs <= LIMITS.welcomeMs, `peer welcome took ${Math.round(welcomeMs)} ms (limit ${LIMITS.welcomeMs})`);
    await until(
      host.page,
      () => window.__harness.netRole === 'host' && window.__harness.gameReady > 0,
      30_000,
      'host game',
    );
    await until(
      peer.page,
      () => window.__harness.netRole === 'peer' && window.__harness.gameReady > 0,
      30_000,
      'peer game',
    );
    await shoot(1, [
      ['host', host],
      ['peer', peer],
    ]);

    log('2 host places three entities; watcher design equals host design at each rev');
    for (let index = 0; index < 3; index += 1) {
      const id = stableId();
      const entity = {
        id,
        prefab: 'platform',
        level: 'main',
        origin: 'creator',
        props: { x: 300 + index * 220, y: 320 },
      };
      const rev = await host.page.evaluate((patch) => window.__harness.sendTx([patch]), {
        op: 'add' as const,
        path: ['entities', id],
        value: entity,
      });
      await until(peer.page, `window.__harness.rev >= ${rev}`, 5_000, `watcher rev ${rev}`);
      const [hostDoc, peerDoc] = await Promise.all(
        [host, peer].map((client) => client.page.evaluate((at) => window.__harness.docs.get(at), rev)),
      );
      assert(
        JSON.stringify(hostDoc) === JSON.stringify(peerDoc),
        `watcher design differs from host design at rev ${rev}`,
      );
      probes[`designRev${rev}`] = true;
    }
    await shoot(2, [
      ['host', host],
      ['peer', peer],
    ]);

    log('3 canary through private presence and a bad design path');
    const watcherBefore = peer.received.length;
    await host.page.evaluate((value) => {
      window.__harness.send('presence', { p: { privateMode: true, focusControlId: value, selection: [] } });
      window.__harness.send('design.tx', {
        tx: {
          branchId: 'main',
          rev: 99,
          baseRev: 3,
          actor: 'owner-1',
          kind: 'manual',
          patches: [{ op: 'add', path: ['prompt', value], value }],
        },
      });
    }, canary);
    await host.page.waitForTimeout(500);
    evidence.sentFrames = framesContaining(host.sent, canary);
    evidence.watcherFrames = peer.received.length;
    evidence.leaked = framesContaining(peer.received, canary);
    probes.canarySentFrames = evidence.sentFrames;
    probes.watcherFrames = evidence.watcherFrames;
    assert(evidence.sentFrames >= 2, `canary reached the wire in ${evidence.sentFrames} host frame(s); expected 2`);
    assert(peer.received.length > watcherBefore, 'watcher received nothing after the canary (presence sync missing)');
    assert(evidence.leaked === 0, `canary leaked into ${evidence.leaked} frame(s) the watcher received`);

    log('4 play; peer playing within 500 ms');
    const playSentAt = await host.page.evaluate(() => window.__harness.play());
    await until(peer.page, () => window.__harness.phase === 'playing', 5_000, 'peer phase playing');
    const peerPlayingAt = await peer.page.evaluate(
      () => window.__harness.phases.findLast((entry) => entry.phase === 'playing')?.at ?? Number.NaN,
    );
    const playSwitchMs = peerPlayingAt - playSentAt;
    probes.playSwitchMs = playSwitchMs;
    assert(
      playSwitchMs <= LIMITS.playSwitchMs,
      `peer entered playing after ${playSwitchMs} ms (limit ${LIMITS.playSwitchMs})`,
    );
    await shoot(4, [
      ['host', host],
      ['peer', peer],
    ]);

    log('5 peer input for 1 s moves its avatar in the host snapshot');
    await untilNode(
      host.page,
      async () => (await playerX(host.page, 1)) !== undefined && (await playerX(peer.page, 1)) !== undefined,
      10_000,
      'peer avatar spawned on the host and the peer',
    );
    const peerXBefore = await playerX(host.page, 1);
    const hostXBefore = await playerX(host.page, 0);
    await peer.page.evaluate(() => window.__harness.hold({ move: 1 }, 1_000));
    await host.page.waitForTimeout(250);
    const peerXAfter = await playerX(host.page, 1);
    const hostXAfter = await playerX(host.page, 0);
    probes.peerMovedPx = Math.round((peerXAfter ?? 0) - (peerXBefore ?? 0));
    assert(
      peerXBefore !== undefined && peerXAfter !== undefined && peerXAfter > peerXBefore,
      `peer avatar did not move in the host's renderGameToText (${peerXBefore} -> ${peerXAfter})`,
    );
    assert(hostXAfter === hostXBefore, 'host avatar moved on peer input');
    await untilNode(
      peer.page,
      async () => ((await playerX(peer.page, 1)) ?? Number.NEGATIVE_INFINITY) > peerXBefore,
      5_000,
      "the peer's own render to show the host snapshot's move",
    );
    await shoot(5, [
      ['host', host],
      ['peer', peer],
    ]);

    log('6 host leaves: pausedForHost, then ended host-left');
    const leftAt = Date.now();
    await host.context.close();
    await until(peer.page, () => window.__harness.phase === 'pausedForHost', 5_000, 'pausedForHost');
    const windowMs = TEST_TIMINGS.ownerReconnectSec * 1_000;
    await until(peer.page, () => window.__harness.ended !== undefined, windowMs + 5_000, 'ended');
    probes.hostLeftEndedMs = Date.now() - leftAt;
    const endedReason = await peer.page.evaluate(() => window.__harness.ended);
    assert(endedReason === 'host-left', `room ended with ${endedReason}, expected host-left`);
    const deadline = Date.now() + 5_000;
    while (!ended.some((entry) => entry.roomId === roomId) && Date.now() < deadline)
      await new Promise((done) => setTimeout(done, 50));
    assert(
      ended.some((entry) => entry.roomId === roomId && entry.reason === 'host-left'),
      'API callback did not receive ended: host-left',
    );
    await shoot(6, [['peer', peer]]);

    log('7 reopened host loads a draft; both clients ready and the pin changes');
    stepStartedAt = Date.now();
    const draftRoom = await createRoom();
    const host2 = await openClient(browser, appUrl, consoleEntries);
    await peer.page.goto(appUrl);
    await peer.page.waitForFunction(() => window.__harness !== undefined);
    await joinRoom(host2, joinArgs(draftRoom, await grant(draftRoom, OWNER, 'owner')));
    await joinRoom(peer, joinArgs(draftRoom, await grant(draftRoom, PEER, 'player')));
    await until(host2.page, () => window.__harness.gameReady > 0, 30_000, 'reopened host game');
    await until(peer.page, () => window.__harness.gameReady > 0, 30_000, 'peer game in the new room');
    await host2.page.evaluate((buildId) => window.__harness.loadDraft(buildId), DRAFT_BUILD);
    for (const client of [host2, peer]) {
      await until(client.page, `window.__harness.pinBuildId === ${JSON.stringify(DRAFT_BUILD)}`, 30_000, 'pin change');
      const sent = await client.page.evaluate(() => window.__harness.draftReadySent);
      assert(sent.includes(DRAFT_BUILD), 'a client did not report draft.ready');
    }
    probes.draftPin = DRAFT_BUILD;
    await shoot(7, [
      ['host', host2],
      ['peer', peer],
    ]);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  } finally {
    await browser?.close().catch(() => undefined);
    if (rooms && rooms.exitCode === null) {
      const exited = new Promise((done) => rooms!.once('exit', done));
      rooms.kill('SIGTERM');
      await Promise.race([exited, new Promise((done) => setTimeout(done, 3_000))]);
      if (rooms.exitCode === null) rooms.kill('SIGKILL');
    }
    await Promise.all(servers.map((server) => new Promise((done) => server.close(done))));
    rmSync(work, { recursive: true, force: true });
  }

  const budgets = unknownBudgets();
  const consoleList = consoleEntries.list();
  const report: VerifyReport = {
    runId: newRunId(),
    renderer,
    software: isSoftware(renderer),
    viewport: 'desktop',
    tier: 'desktop',
    frames,
    console: consoleList,
    budgets,
    probes,
    clients: 2,
    unchecked: [...ALWAYS_UNCHECKED, 'WAN latency', 'sign-in'],
    verdict: error ? 'fail' : verdictFor({ budgets, console: consoleList }),
    ...(error ? { error } : {}),
    startedAt,
    endedAt: new Date().toISOString(),
    gmVerifyVersion: GM_VERIFY_VERSION,
  };
  const reportPath = writeReport(out, report);
  return { report, reportPath, canary: evidence };
}
