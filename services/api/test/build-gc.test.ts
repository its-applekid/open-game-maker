import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { type CachePlan } from '@ogm/contracts';
import { schema } from '@ogm/db';
import { blobPath, buildDir } from '@ogm/games-host/layout';
import { describe, expect, it } from 'vitest';

import { builderHeaders, ids, insertBuild, publish, setup } from './release-fixtures.js';
import { makeApp } from './helpers.js';

function plan(sha256: string, url: string, bytes: number): CachePlan {
  const totals = {
    desktop: {
      boot: { bytes: 0, files: 0 },
      ready: { bytes, files: 1 },
      stream: { bytes: 0, files: 0 },
    },
    mobile: {
      boot: { bytes: 0, files: 0 },
      ready: { bytes: 0, files: 0 },
      stream: { bytes: 0, files: 0 },
    },
    low: {
      boot: { bytes: 0, files: 0 },
      ready: { bytes: 0, files: 0 },
      stream: { bytes: 0, files: 0 },
    },
  };
  return {
    version: 1,
    gameId: ids.game,
    buildId: '',
    built: '2026-11-02T20:00:00.000Z',
    sdkVersion: '1.0.0',
    tiers: ['desktop'],
    entries: [{ sha256, url, bytes, kind: 'sprite', phase: 'ready', tiers: ['*'] }],
    totals,
  };
}

function writeBuildPlan(root: string, buildId: string, value: CachePlan): void {
  const directory = buildDir(root, ids.game, buildId);
  mkdirSync(join(directory, 'assets'), { recursive: true });
  writeFileSync(join(directory, 'assets', 'cache-plan.json'), JSON.stringify({ ...value, buildId }));
}

describe('build artifact collection', () => {
  it('refuses release-backed builds and collects only blobs no present build references', async () => {
    const { deps, source } = setup();
    insertBuild(deps, source);
    insertBuild(deps, source, { id: ids.build2, createdAt: '2026-11-02T20:31:00.000Z' });
    const sharedHash = 'a'.repeat(64);
    const uniqueHash = 'b'.repeat(64);
    const sharedFile = `${sharedHash}.png`;
    const uniqueFile = `${uniqueHash}.png`;
    mkdirSync(join(deps.config.gamesRoot, '_a'), { recursive: true });
    writeFileSync(blobPath(deps.config.gamesRoot, sharedFile), 'shared');
    writeFileSync(blobPath(deps.config.gamesRoot, uniqueFile), 'unique');
    writeBuildPlan(deps.config.gamesRoot, ids.build, plan(sharedHash, `/a/${sharedFile}`, 6));
    writeBuildPlan(deps.config.gamesRoot, ids.build2, plan(uniqueHash, `/a/${uniqueFile}`, 6));
    const { app } = await makeApp(deps);
    expect((await publish(app, ids.build)).status).toBe(201);

    const refused = await app.request(`/internal/builds/${ids.build}`, {
      method: 'PATCH',
      headers: builderHeaders,
      body: JSON.stringify({ artifact: 'gc' }),
    });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: 'build_referenced' });
    expect(existsSync(buildDir(deps.config.gamesRoot, ids.game, ids.build))).toBe(true);

    const collected = await app.request(`/internal/builds/${ids.build2}`, {
      method: 'PATCH',
      headers: builderHeaders,
      body: JSON.stringify({ artifact: 'gc' }),
    });
    expect(collected.status).toBe(200);
    expect(await collected.json()).toMatchObject({ id: ids.build2, artifact: 'gc' });
    expect(deps.db.select({ artifact: schema.builds.artifact }).from(schema.builds).all()).toEqual([
      { artifact: 'present' },
      { artifact: 'gc' },
    ]);
    expect(existsSync(buildDir(deps.config.gamesRoot, ids.game, ids.build2))).toBe(false);
    expect(existsSync(blobPath(deps.config.gamesRoot, sharedFile))).toBe(true);
    expect(existsSync(blobPath(deps.config.gamesRoot, uniqueFile))).toBe(false);

    const republish = await publish(app, ids.build2);
    expect(republish.status).toBe(409);
    expect(await republish.json()).toEqual({ error: 'artifact_missing' });
  });
});
