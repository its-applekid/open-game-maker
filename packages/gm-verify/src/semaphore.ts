import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

export const HOST_SLOTS = 2;
export const SLOT_WAIT_MS = 10 * 60_000;

export type SemaphoreOptions = { runtimeDir?: string; slots?: number; waitMs?: number; pollMs?: number };

/** `$XDG_RUNTIME_DIR/ogm-verify`, else a per-user directory under the temp dir. */
export function lockRoot(runtimeDir: string | undefined): string {
  return runtimeDir ? join(runtimeDir, 'ogm-verify') : join(tmpdir(), `ogm-verify-${userInfo().uid}`);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function tryTake(slot: string): boolean {
  try {
    mkdirSync(slot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    let pid = Number.NaN;
    try {
      pid = Number(readFileSync(join(slot, 'pid'), 'utf8'));
    } catch {
      /* a holder writes its pid right after mkdir; only a slot left without one for 10 s is stale */
      const age = Date.now() - (statSync(slot, { throwIfNoEntry: false })?.mtimeMs ?? 0);
      if (age < 10_000) return false;
    }
    if (Number.isInteger(pid) && pid > 0 && alive(pid)) return false;
    rmSync(slot, { recursive: true, force: true });
    return tryTake(slot);
  }
  writeFileSync(join(slot, 'pid'), String(process.pid));
  return true;
}

/** A host-wide counting semaphore of lock directories; a slot whose holder PID is dead is reaped. */
export async function acquireSlot(options: SemaphoreOptions = {}): Promise<{ slot: string; release(): void }> {
  const root = lockRoot(options.runtimeDir);
  const slots = options.slots ?? HOST_SLOTS;
  const deadline = Date.now() + (options.waitMs ?? SLOT_WAIT_MS);
  mkdirSync(root, { recursive: true });
  let pause = options.pollMs ?? 100;
  for (;;) {
    for (let i = 0; i < slots; i += 1) {
      const slot = join(root, `slot-${i}`);
      if (tryTake(slot)) {
        let held = true;
        return {
          slot,
          release() {
            if (!held) return;
            held = false;
            rmSync(slot, { recursive: true, force: true });
          },
        };
      }
    }
    if (Date.now() >= deadline) throw new Error(`no free capture slot after ${options.waitMs ?? SLOT_WAIT_MS} ms`);
    await sleep(pause);
    pause = Math.min(pause * 2, 2_000);
  }
}
