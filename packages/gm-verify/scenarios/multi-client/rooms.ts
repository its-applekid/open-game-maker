/**
 * Scenario-owned rooms process: the real `services/rooms` build, bound to 127.0.0.1 on `OGM_ROOMS_PORT`, with the
 * reconnection and idle windows shortened by a JSON timings argument (seconds). Its env holds only the scenario's
 * fixture secrets and ports; nothing is read from `~/.config/ogm`.
 *
 *   node rooms.ts <services/rooms/dist> '{"ownerReconnectSec":2}'
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type RoomTimings = Record<string, unknown>;
type RoomsConfig = { port: number; timings: RoomTimings };
type RoomsBundle = {
  gameServer: {
    listen(port: number, host: string): Promise<unknown>;
    gracefullyShutdown(exit: boolean): Promise<void>;
  };
};

const [distDir, timingsJson = '{}'] = process.argv.slice(2);
if (!distDir) throw new Error('usage: node rooms.ts <services/rooms/dist> [timings-json]');

const load = async <T>(file: string): Promise<T> => (await import(pathToFileURL(join(distDir, file)).href)) as T;
const { loadRoomsConfig } = await load<{ loadRoomsConfig(): RoomsConfig }>('config.js');
const { roomTimings } = await load<{ roomTimings(overrides: RoomTimings): RoomTimings }>('lifecycle.js');
const { createRoomsServer } = await load<{ createRoomsServer(config: RoomsConfig): RoomsBundle }>('server.js');

const overrides = JSON.parse(timingsJson) as RoomTimings;
const config = { ...loadRoomsConfig(), timings: roomTimings({ callbackRetryMs: [], ...overrides }) };
const bundle = createRoomsServer(config);
await bundle.gameServer.listen(config.port, '127.0.0.1');
console.log(JSON.stringify({ event: 'listening', port: config.port }));

const stop = () => void bundle.gameServer.gracefullyShutdown(false).finally(() => process.exit(0));
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
