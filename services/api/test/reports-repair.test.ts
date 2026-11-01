import { schema } from '@ogm/db';
import { describe, expect, it, vi } from 'vitest';

import { CommitServiceIssueWriter, StoredIssueWriter } from '../src/reports/issue-writer.js';
import { REPAIR_ATTEMPTS } from '../src/reports/policy.js';
import { admitRepair, repairPlan } from '../src/reports/repair.js';
import { makeDeps } from './helpers.js';
import { ids, reportsApp } from './reports-helpers.js';

const SIG = 'c'.repeat(64);
const input = {
  gameId: ids.game,
  ownerId: ids.owner,
  familyId: ids.family,
  reportId: 'r_70000000-0000-4000-8000-0000000000aa',
  releaseId: ids.release,
  signature: SIG,
  reproduction: 'crash_with_error' as const,
};
const defaults = { dailyAllowanceMicroUsd: 5_000_000, resetZone: 'America/Los_Angeles' };

describe('repair admission', () => {
  it('admits a medium repair at the repair/medium p80 reservation, owned by the game owner', async () => {
    const { deps } = await reportsApp();
    const outcome = await admitRepair({ ...deps, defaults }, input);
    const job = deps.db.select().from(schema.jobs).get()!;
    expect(outcome.jobId).toBe(job.id);
    expect(job).toMatchObject({ kind: 'repair', complexity: 2, creatorId: ids.owner, slot: 'edit' });
    const p80 = deps.db
      .select()
      .from(schema.sizeClasses)
      .all()
      .find((r) => r.kind === 'repair' && r.sizeClass === 'medium')!;
    expect(JSON.parse(job.reservation)).toMatchObject({ sizeClass: 'medium', amountMicroUsd: p80.p80MicroUsd });
    const feature = deps.db
      .select()
      .from(schema.sizeClasses)
      .all()
      .find((r) => r.kind === 'feature' && r.sizeClass === 'medium')!;
    expect(p80.p80MicroUsd).toBeLessThan(feature.p80MicroUsd / 2);
  });

  it('returns pendingBudget and spends nothing when the owner has no allowance', async () => {
    const { deps } = await reportsApp({ ownerDaily: 0 });
    expect(await admitRepair({ ...deps, defaults }, input)).toEqual({ pendingBudget: true });
    expect(deps.db.select().from(schema.jobs).all()).toHaveLength(0);
    expect(deps.db.select().from(schema.budgetLedger).all()).toHaveLength(0);
  });

  it('builds a plan from redacted metadata only, with the attempt limit in acceptance', () => {
    const plan = JSON.stringify(repairPlan(input));
    expect(plan).toContain(SIG);
    expect(plan).toContain(input.reportId);
    expect(plan).toContain(`at most ${REPAIR_ATTEMPTS} attempts`);
    for (const leaked of ['applyDamage', 'combat.js', 'sha256:', 'hp']) expect(plan).not.toContain(leaked);
  });
});

describe('issue writers', () => {
  const issue = { title: 'Platform TypeError', body: 'Signature x', labels: ['bug', 'source:report'] };

  it('stores platform issues in the operator queue by default', async () => {
    const deps = makeDeps();
    const { ref } = await new StoredIssueWriter(deps.db).file(issue);
    const row = deps.db.select().from(schema.platformIssueQueue).get()!;
    expect(ref).toBe(`queue:${row.id}`);
    expect(row).toMatchObject({ status: 'pending', title: issue.title });
  });

  it('never files an issue carrying an agent label', async () => {
    const deps = makeDeps();
    await expect(new StoredIssueWriter(deps.db).file({ ...issue, labels: ['agent:todo'] })).rejects.toThrow();
    const fetch = vi.fn();
    await expect(
      new CommitServiceIssueWriter({ baseUrl: 'http://127.0.0.1:1', token: 't', fetch }).file({
        ...issue,
        labels: ['agent:todo'],
      }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('files through the commit service file_issue op', async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true, sha: 'issue:42' }));
    const writer = new CommitServiceIssueWriter({ baseUrl: 'http://127.0.0.1:4301/', token: 'tok', fetch });
    expect(await writer.file(issue)).toEqual({ ref: 'issue:42' });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:4301/internal/commit');
    expect(JSON.parse(init.body as string)).toEqual({ kind: 'file_issue', ...issue });
    fetch.mockResolvedValueOnce(Response.json({ ok: false, verdict: {} }, { status: 422 }));
    await expect(writer.file(issue)).rejects.toThrow(/refused/);
  });
});
