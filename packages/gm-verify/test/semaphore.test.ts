import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { acquireSlot } from '../src/semaphore.js';

const runtime = () => mkdtempSync(join(tmpdir(), 'gm-sem-'));

describe('acquireSlot', () => {
  it('lets two captures run and makes the third wait until one releases', async () => {
    const runtimeDir = runtime();
    const a = await acquireSlot({ runtimeDir, pollMs: 10 });
    const b = await acquireSlot({ runtimeDir, pollMs: 10 });
    let third = false;
    const c = acquireSlot({ runtimeDir, pollMs: 10 }).then((slot) => {
      third = true;
      return slot;
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(third).toBe(false);
    a.release();
    const slot = await c;
    expect(third).toBe(true);
    expect(slot.slot).toBe(a.slot);
    b.release();
    slot.release();
  });

  it('gives up after waitMs', async () => {
    const runtimeDir = runtime();
    await acquireSlot({ runtimeDir, slots: 1 });
    await expect(acquireSlot({ runtimeDir, slots: 1, waitMs: 50, pollMs: 10 })).rejects.toThrow(/no free capture slot/);
  });

  it('reaps a slot whose holder PID is dead', async () => {
    const runtimeDir = runtime();
    const slot = join(runtimeDir, 'ogm-verify', 'slot-0');
    mkdirSync(slot, { recursive: true });
    writeFileSync(join(slot, 'pid'), '2147483646');
    const got = await acquireSlot({ runtimeDir, slots: 1, waitMs: 100 });
    expect(got.slot).toBe(slot);
    got.release();
  });

  it('keeps a slot whose holder is alive', async () => {
    const runtimeDir = runtime();
    const slot = join(runtimeDir, 'ogm-verify', 'slot-0');
    mkdirSync(slot, { recursive: true });
    writeFileSync(join(slot, 'pid'), String(process.ppid));
    await expect(acquireSlot({ runtimeDir, slots: 1, waitMs: 50, pollMs: 10 })).rejects.toThrow();
  });
});
