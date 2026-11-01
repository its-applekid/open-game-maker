import { AiurHttpError, type AiurClient, type TicketUsage } from '@ogm/aiur-client';
import { schema } from '@ogm/db';
import { describe, expect, it, vi } from 'vitest';

import {
  reconcileJob,
  startUsageReconciler,
  type ApplyUsage,
  type UsageReconcilerDeps,
} from '../../src/budget/aiur-usage.js';
import { reserve } from '../../src/budget/ledger.js';
import { makeDeps } from '../helpers.js';

const NOW = new Date('2026-11-01T22:00:00.000Z');

function usage(total = '0.734512', coverage = 'complete', session = total): TicketUsage {
  const measure = (amount: string) => ({
    tokens: 184_210,
    provider_reported: { USD: '0.000000' },
    api_equivalent: { amount: { USD: amount }, coverage: { status: coverage, known: 1, unknown: 0 } },
  });
  return {
    contract: 'aiur.ticket_usage',
    contract_version: 1,
    schema_version: 1,
    ticket: { owner: 'owner', repository: 'game', identifier: '142' },
    currency: 'USD',
    state: 'available',
    authority: {},
    freshness: {},
    totals: measure(total),
    by_model: [],
    by_provider: [],
    sessions: [{ ...measure(session), run_id: 'r_8f3c', by_model: [], by_provider: [] }],
  };
}

function setup(input: { usage?: () => Promise<TicketUsage>; applyUsage?: ApplyUsage } = {}) {
  const base = makeDeps();
  base.db
    .insert(schema.families)
    .values({ id: 'f_1', name: 'Family', ownerUserId: 'u_1', createdAt: NOW.toISOString() })
    .run();
  base.db
    .insert(schema.games)
    .values({
      id: 'g_1',
      familyId: 'f_1',
      ownerId: 'u_1',
      title: 'Game',
      visibility: 'private',
      repoVisibility: 'private',
      createdAt: NOW.toISOString(),
    })
    .run();
  base.db
    .insert(schema.jobs)
    .values({
      id: 'j_1',
      gameId: 'g_1',
      branchId: 'main',
      familyId: 'f_1',
      creatorId: 'u_1',
      kind: 'feature',
      complexity: 2,
      state: 'running',
      start: 'now',
      slot: 'edit',
      plan: JSON.stringify({
        title: 'Feature',
        summary: 'Build it',
        scope: { included: ['feature'], excluded: [] },
        tickets: [{ key: 'T1', skills: [], dependsOn: [], acceptanceCriteria: ['works'] }],
      }),
      reservation: '{"amountMicroUsd":4000000,"sizeClass":"medium","confidence":"low"}',
      hardCapMicroUsd: 4_000_000,
      aiurRepo: 'owner/game',
      aiurIssueNumber: 142,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    })
    .run();
  reserve({ db: base.db, jobId: 'j_1', at: NOW, zone: 'America/Los_Angeles' });
  const usageCall = input.usage ?? vi.fn().mockResolvedValue(usage());
  const applyUsage = input.applyUsage ?? vi.fn();
  const deps: UsageReconcilerDeps = {
    db: base.db,
    sqlite: base.sqlite,
    events: base.events,
    defaults: { dailyAllowanceMicroUsd: 5_000_000, resetZone: 'America/Los_Angeles' },
    daemonFor: async () => ({ usage: usageCall }) as unknown as AiurClient,
    applyUsage,
    now: () => NOW,
    log: base.log,
  };
  return { base, deps, usageCall, applyUsage };
}

describe('aiur usage reconciliation', () => {
  it('upserts each run and stores the exact aggregate', async () => {
    const { base, deps, applyUsage } = setup();

    await expect(reconcileJob(deps, 'j_1')).resolves.toEqual({ usageMicroUsd: 734_512, coverage: 'complete' });

    expect(base.db.select().from(schema.usageSamples).all()).toEqual([
      expect.objectContaining({
        jobId: 'j_1',
        runId: 'r_8f3c',
        repo: 'owner/game',
        issue: 142,
        apiEquivalentMicro: 734_512,
        providerReportedMicro: 0,
        coverageStatus: 'complete',
      }),
    ]);
    expect(base.db.select().from(schema.jobs).get()).toMatchObject({
      usageMicroUsd: 734_512,
      usageCoverage: 'complete',
      aiurRunId: 'r_8f3c',
    });
    expect(applyUsage).toHaveBeenCalledWith(expect.objectContaining({ id: 'j_1' }), {
      usageMicroUsd: 734_512,
      pessimisticMicroUsd: 734_512,
      coverageStatus: 'complete',
    });
  });

  it('never lowers the stored job total', async () => {
    let current = usage();
    const { base, deps } = setup({ usage: async () => current });
    await reconcileJob(deps, 'j_1');
    current = usage('0.650000', 'complete', '0.650000');

    await reconcileJob(deps, 'j_1');

    expect(base.db.select().from(schema.jobs).get()?.usageMicroUsd).toBe(734_512);
  });

  it('passes the reservation as pessimistic usage for incomplete coverage', async () => {
    const applyUsage = vi.fn();
    const { deps } = setup({ usage: async () => usage('1.100000', 'partial'), applyUsage });

    await reconcileJob(deps, 'j_1');

    expect(applyUsage).toHaveBeenCalledWith(expect.objectContaining({ id: 'j_1' }), {
      usageMicroUsd: 1_100_000,
      pessimisticMicroUsd: 4_000_000,
      coverageStatus: 'partial',
    });
  });

  it.each([
    [503, 'usage_unavailable'],
    [404, 'usage_not_found'],
  ] as const)('skips retryable usage error %s %s', async (status, code) => {
    const { base, deps } = setup({
      usage: async () => {
        throw new AiurHttpError(status, code, code, 'http://127.0.0.1:4101');
      },
    });

    await expect(reconcileJob(deps, 'j_1')).resolves.toEqual({ skipped: code });
    expect(base.db.select().from(schema.usageSamples).all()).toEqual([]);
    expect(base.db.select().from(schema.jobs).get()?.usageMicroUsd).toBe(0);
  });

  it('reconciles terminal usage and releases reservation and slot once', async () => {
    const { base, deps } = setup();
    const reconciler = startUsageReconciler(deps, 60_000);
    await reconciler.idle();

    base.events.emit('job.stage.changed', { jobId: 'j_1', from: 'building', to: 'done', text: 'Done' });
    base.events.emit('job.stage.changed', { jobId: 'j_1', from: 'done', to: 'done', text: 'Done' });
    await reconciler.idle();
    reconciler.stop();

    expect(base.db.select().from(schema.jobs).get()).toMatchObject({
      usageMicroUsd: 734_512,
      releasedAt: NOW.toISOString(),
    });
    expect(
      base.db
        .select()
        .from(schema.budgetLedger)
        .all()
        .filter(({ kind }) => kind === 'release'),
    ).toEqual([expect.objectContaining({ amountMicroUsd: 3_265_488 })]);
  });
});
