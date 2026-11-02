import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { verifyReportSchema } from '../src/report.js';
import { framesContaining, LIMITS, newCanary, runTwoClient } from './two-client.ts';

/* The full run needs a built rooms service, Chromium and a GPU (or SwiftShader); CI runs only the pure tests below. */
// eslint-disable-next-line no-restricted-properties -- opt-in switch for a host-only scenario, not configuration
const enabled = process.env.OGM_SCENARIOS === '1';
// eslint-disable-next-line no-restricted-properties -- same opt-in, see above
const softwareGl = process.env.GM_VERIFY_SOFTWARE_GL === '1';
const TEMPLATE = fileURLToPath(new URL('../../../templates/game-multiplayer/', import.meta.url));

describe('two-client canary search', () => {
  it('makes a fresh 24-character canary per run', () => {
    const first = newCanary();

    expect(first).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(newCanary()).not.toBe(first);
  });

  it('finds the canary byte-wise in text and binary frames', () => {
    const canary = newCanary();
    const frames = [
      `{"t":"presence","p":{"focusControlId":"${canary}"}}`,
      Buffer.concat([Buffer.from([0x82, 0xa1]), Buffer.from(canary), Buffer.from([0x00])]),
      'no secret here',
      Buffer.from([0x01, 0x02, 0x03]),
    ];

    expect(framesContaining(frames, canary)).toBe(2);
    expect(framesContaining(frames.slice(2), canary)).toBe(0);
  });
});

describe.skipIf(!enabled)('two-client scenario (OGM_SCENARIOS=1)', () => {
  it('runs the seven T07 §4.5 steps against the local rooms service and writes a two-client report', async () => {
    const out = mkdtempSync(join(tmpdir(), 'gm-two-client-out-'));
    try {
      const { report, reportPath, canary } = await runTwoClient({ gameDir: TEMPLATE, out, softwareGl });

      expect(report.error).toBeUndefined();
      expect(report.verdict).toBe('pass');
      expect(verifyReportSchema.parse(JSON.parse(readFileSync(reportPath, 'utf8')))).toMatchObject({ clients: 2 });
      expect(report.renderer).not.toBe('unknown');
      if (softwareGl) expect(report.renderer).toMatch(/swiftshader/i);
      expect(report.unchecked).toEqual(expect.arrayContaining(['iPhone Safari', 'WAN latency', 'sign-in']));
      expect(report.probes.welcomeMs).toBeLessThanOrEqual(LIMITS.welcomeMs);
      expect(report.probes.playSwitchMs).toBeLessThanOrEqual(LIMITS.playSwitchMs);
      expect([1, 2, 3].map((rev) => report.probes[`designRev${rev}`])).toEqual([true, true, true]);
      expect(canary.sentFrames).toBeGreaterThanOrEqual(2);
      expect(canary.watcherFrames).toBeGreaterThan(0);
      expect(canary.leaked).toBe(0);
      expect(Number(report.probes.peerMovedPx)).toBeGreaterThan(0);
      expect(report.probes.draftPin).toBe('b2');
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 300_000);
});
