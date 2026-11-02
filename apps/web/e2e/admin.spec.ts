import { expect, test, type Page, type Route } from '@playwright/test';

import { installAuthRoutes } from './fixtures/auth-routes';

const ids = {
  family: 'f_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e6f',
  game: 'g_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e6f',
  job: 'j_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e6f',
  member: 'u_member',
};

const owner = member('u1', 'owner@example.com', 'owner');
const familyMember = member(ids.member, 'member@example.com', 'member');
const game = {
  id: ids.game,
  familyId: ids.family,
  ownerId: 'u1',
  title: 'Moonlight Door',
  visibility: 'private',
  repoVisibility: 'private',
  repo: null,
  createdAt: '2026-11-01T08:00:00.000Z',
  delistedAt: null,
};
const job = {
  id: ids.job,
  gameId: ids.game,
  branchId: 'main',
  familyId: ids.family,
  creatorId: ids.member,
  kind: 'feature',
  complexity: 3,
  state: 'running',
  pausedReason: null,
  start: 'now',
  startAt: null,
  slot: 'edit',
  plan: { title: 'Moonlight Door', summary: 'Add the door.', scope: { included: [], excluded: [] }, tickets: [] },
  reservation: { amountMicroUsd: 400_000, sizeClass: 'medium', confidence: 'low' },
  hardCapMicroUsd: 400_000,
  usageMicroUsd: 250_000,
  aiurRepo: null,
  aiurIssueNumber: 86,
  aiurSpendCapMicroUsd: null,
  idempotencyKey: null,
  createdAt: '2026-11-01T09:00:00.000Z',
  updatedAt: '2026-11-01T09:10:00.000Z',
  terminalAt: null,
};

test.use({ serviceWorkers: 'block' });

test('redirects a non-admin session out of the admin surface', async ({ page }) => {
  await installAuthRoutes(page, { signedIn: true });
  await installAdminRoutes(page, 'none');

  await page.goto('/admin');

  await expect(page).toHaveURL(/\/games$/);
});

test('protects the owner and confirms member removal', async ({ page }) => {
  await installAuthRoutes(page, { signedIn: true });
  const requests = await installAdminRoutes(page);

  await page.goto('/admin/members?test');

  const ownerRow = page.getByText(owner.email).locator('..');
  await expect(ownerRow).not.toContainText('Remove member');
  await page.getByRole('button', { name: `Remove ${familyMember.email}` }).click();
  expect(requests.memberDeletes).toBe(0);
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect.poll(() => requests.memberDeletes).toBe(1);
});

test('shows a responsive build timeline and the complete activity set', async ({ page }) => {
  await installAuthRoutes(page, { signedIn: true });
  await installAdminRoutes(page);

  await page.goto(`/admin/builds/${ids.job}?test`);

  await expect(page.getByRole('img', { name: 'Build timeline' })).toBeVisible();
  for (const label of [
    'Asset pipeline',
    'Level building',
    'Gameplay code',
    'Animation & VFX',
    'Audio',
    'UI & HUD',
    'Playtesting',
    'Deploy & release',
    'Writing',
  ]) {
    await expect(page.getByLabel('Activity minutes').getByText(label)).toBeVisible();
  }
  await expect
    .poll(() =>
      page.evaluate(() => {
        type AdminWindow = Window & { __ogmHost?: { admin?: { route: string; lastTimeline: unknown } } };
        return (window as AdminWindow).__ogmHost?.admin;
      }),
    )
    .toMatchObject({ route: `/admin/builds/${ids.job}`, lastTimeline: { jobId: ids.job } });
});

test('keeps primary admin actions at least 64 pixels tall', async ({ page }) => {
  await installAuthRoutes(page, { signedIn: true });
  await installAdminRoutes(page);

  await page.goto('/admin/budgets?test');

  const box = await page.getByRole('button', { name: 'Save settings' }).boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(64);
});

async function installAdminRoutes(page: Page, platformRole: 'admin' | 'maintainer' | 'none' = 'admin') {
  const requests = { memberDeletes: 0 };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === '/api/v1/me') {
      return json(route, {
        user: { id: 'u1', email: owner.email },
        family: { id: ids.family, name: 'Door Family', role: 'owner', capability: 'creator' },
        platformRole,
      });
    }
    if (path === '/api/v1/admin/members' && request.method() === 'GET') {
      return json(route, { members: [owner, familyMember] });
    }
    if (path === `/api/v1/admin/members/${ids.member}` && request.method() === 'DELETE') {
      requests.memberDeletes += 1;
      return route.fulfill({ status: 204, body: '' });
    }
    if (path === '/api/v1/admin/settings') {
      return json(route, settings);
    }
    if (path === '/api/v1/admin/budget') {
      return json(route, {
        familyDayMicroUsd: 300_000,
        platformCapMicroUsd: 1_000_000,
        resetsAt: '2026-11-02T00:00:00.000Z',
        unitLabel: 'stars',
        microUsdPerUnit: 100_000,
        slots: settings.slots,
        inUse: { new_game: 1, edit: 1 },
        queued: [],
        members: [owner, familyMember],
      });
    }
    if (path === '/api/v1/admin/builds') {
      return json(route, {
        builds: [{ job, game, member: familyMember, retries: 1 }],
        games: [game],
        members: [owner, familyMember],
      });
    }
    if (path === `/api/v1/analytics/builds/${ids.job}/timeline`) return json(route, timeline());
    if (path === '/api/v1/analytics/rollups') return json(route, rollup(url));
    if (path === '/api/v1/games') return json(route, { games: [] });
    if (path === '/api/v1/budget/status') return json(route, { unitLabel: 'stars' });
    if (path === '/api/v1/voice/token') return json(route, { error: 'unavailable' }, 503);
    if (path === '/api/v1/notifications/stream') {
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': connected\n\n' });
    }
    return json(route, { error: 'not_mocked', path, method: request.method() }, 404);
  });
  return requests;
}

const settings = {
  familyId: ids.family,
  resetZone: 'UTC',
  unitLabel: 'stars',
  microUsdPerUnit: 100_000,
  platformCapMicroUsd: 1_000_000,
  slots: { new_game: 2, edit: 2 },
  hardCapMultiplier: 2,
  friendsAllowed: false,
};

function member(userId: string, email: string, role: 'owner' | 'member') {
  return {
    userId,
    email,
    role,
    capability: role === 'owner' ? 'creator' : 'player',
    joinedAt: '2026-10-01T00:00:00.000Z',
    dailyMicroUsd: 200_000,
    remainingMicroUsd: 150_000,
  };
}

function timeline() {
  return {
    jobId: ids.job,
    aiur: {
      phases: [
        { phase: 'brainstorm', at: '2026-11-01T09:00:00.000Z' },
        { phase: 'plan', at: '2026-11-01T09:01:00.000Z' },
        { phase: 'work', at: '2026-11-01T09:02:00.000Z' },
        { phase: 'review', at: '2026-11-01T09:09:00.000Z' },
      ],
      usageMicroUsd: 250_000,
      retries: 1,
    },
    activities: [
      {
        activity: 'playtesting',
        actor: 'agent',
        source: 'gm_cli',
        startedAt: '2026-11-01T09:03:00.000Z',
        endedAt: null,
        meta: {},
      },
    ],
    generatedAt: '2026-11-01T09:10:00.000Z',
  };
}

function rollup(url: URL) {
  const byActivity = Object.fromEntries(
    [
      'asset_pipeline',
      'level_building',
      'gameplay_code',
      'animation_vfx',
      'audio',
      'ui_hud',
      'playtesting',
      'deploy_release',
      'writing',
    ].map((activity) => [
      activity,
      { count: activity === 'playtesting' ? 1 : 0, durationMs: activity === 'playtesting' ? 60_000 : 0 },
    ]),
  );
  return {
    scope: url.searchParams.get('scope'),
    id: url.searchParams.get('id'),
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
    builds: 1,
    usageMicroUsd: 250_000,
    byActivity,
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}
