import { expect, test, type Page, type Route } from '@playwright/test';

import { installAuthRoutes } from './fixtures/auth-routes';

const jobId = 'j_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e6f';
const imageUrl = 'https://media.example.test/image.svg';
const clipUrl = 'https://media.example.test/clip.mp4';

const job = {
  id: jobId,
  gameId: 'g_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e6f',
  branchId: 'main',
  familyId: 'f_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e6f',
  creatorId: 'u1',
  kind: 'feature',
  complexity: 3,
  state: 'running',
  pausedReason: null,
  start: 'now',
  startAt: null,
  slot: 'edit',
  plan: {
    title: 'Add the moonlit door',
    summary: 'Add a door to the forest room.',
    scope: { included: ['door'], excluded: [] },
    tickets: [{ key: 'OGM-TEST', skills: [], dependsOn: [], acceptanceCriteria: ['The door opens.'] }],
  },
  reservation: { amountMicroUsd: 4_000_000, sizeClass: 'medium', confidence: 'low' },
  hardCapMicroUsd: 4_000_000,
  usageMicroUsd: 1_500_000,
  aiurRepo: null,
  aiurIssueNumber: 57,
  aiurSpendCapMicroUsd: null,
  idempotencyKey: null,
  createdAt: '2026-11-01T09:00:00Z',
  updatedAt: '2026-11-01T09:01:00Z',
  terminalAt: null,
  stage: 'building',
  stageText: 'Building the door',
  progressPercent: 50,
};

const messages = [
  message('m_1', 'image', { text: 'First door sketch', media: media(imageUrl) }),
  message('m_2', 'image', { text: 'Moonlit door sketch', media: media(`${imageUrl}?second`) }),
  message('m_3', 'clip', {
    text: 'The door swings open',
    media: { ...media(clipUrl), poster: `${imageUrl}?poster`, duration_ms: 4_000 },
  }),
  message('m_4', 'text', { text: 'I added the moonlight.' }),
  message('m_5', 'progress', { actor: 'system', text: 'Door animation wired up' }),
  message('m_6', 'checkpoint', {
    text: 'Which door looks right?',
    checkpoint: {
      decision_id: '',
      question: 'Which door looks right?',
      options: [
        { id: 'a', label: 'Wooden', media_id: 'm_1' },
        { id: 'b', label: 'Iron', media_id: 'm_2' },
      ],
      recommend: 'a',
      status: 'open',
    },
  }),
];

test.use({ serviceWorkers: 'block' });

test('phone build dock opens the streamed chat and posts text once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAuthRoutes(page, { signedIn: true });
  await installBuildRoutes(page);
  await page.goto('/games?test');

  const fab = page.getByRole('button', { name: '1 build running, 50% done. Show progress' });
  await expect(fab).toBeVisible();
  expect((await fab.boundingBox())!.width).toBeGreaterThanOrEqual(64);
  expect((await fab.boundingBox())!.height).toBeGreaterThanOrEqual(64);

  await fab.click();
  await page.getByRole('button', { name: /Show each build/ }).click();
  await page.getByRole('button', { name: /Add the moonlit door/ }).click();

  const panel = page.locator('.build-chat-panel');
  await expect(panel).toBeVisible();
  expect((await panel.boundingBox())!.height).toBe(844);
  expect(
    Number.parseFloat(await panel.evaluate((element) => getComputedStyle(element).paddingBottom)),
  ).toBeGreaterThanOrEqual(12);

  await expect(page.locator('.build-chat-row.media img')).toHaveCount(2);
  const clip = page.locator('.build-chat-row.media video');
  await expect(clip).toHaveCount(1);
  await expect(clip).toHaveAttribute('poster', `${imageUrl}?poster`);
  expect(await clip.evaluate((element) => (element as HTMLVideoElement).muted)).toBe(true);
  await expect(page.getByText('Door animation wired up')).toBeVisible();
  await expect(page.getByText('Which door looks right?', { exact: true })).toBeVisible();
  await expect(page.getByText('Checkpoint 1 of 3')).toBeVisible();

  const postedText = 'Make the moonlight warmer';
  await page.getByRole('textbox', { name: 'Message the builder' }).fill(postedText);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(postedText, { exact: true })).toHaveCount(1);

  await expect
    .poll(() =>
      page.evaluate(
        ({ id }) => {
          type JobsApi = { dockState: string; jobs: unknown[]; messagesByJob: Record<string, unknown[]> };
          type TestWindow = Window & { __ogmHost?: { get(name: string): unknown } };
          const api = (window as TestWindow).__ogmHost?.get('jobs') as JobsApi | undefined;
          return api
            ? { dockState: api.dockState, jobs: api.jobs.length, messages: api.messagesByJob[id]?.length }
            : null;
        },
        { id: jobId },
      ),
    )
    .toEqual({ dockState: 'chat', jobs: 1, messages: 7 });

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('.build-chat-landscape-list')).toBeVisible();
  await expect(page.locator('.build-chat-chat-layout')).toHaveCSS('display', 'grid');
  await expect(page.locator('.build-chat-panel')).toHaveCSS('height', '390px');
});

test('a broken picker leaves the chat dock mounted', async ({ page }) => {
  await installAuthRoutes(page, { signedIn: true });
  await installBuildRoutes(page, { brokenPicker: true });
  await page.goto('/games?test');

  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(
    page.locator('#chat-dock-slot').getByRole('button', { name: '1 build running, 50% done. Show progress' }),
  ).toBeVisible();
});

async function installBuildRoutes(page: Page, options: { brokenPicker?: boolean } = {}) {
  await page.route('**/api/v1/games', (route) =>
    json(route, {
      games: options.brokenPicker
        ? [
            {
              id: job.gameId,
              title: { broken: true },
              familyId: job.familyId,
              ownerId: job.creatorId,
              repo: null,
              createdAt: job.createdAt,
            },
          ]
        : [{ id: job.gameId }],
    }),
  );
  await page.route('**/api/v1/jobs?gameId=*', (route) => json(route, { jobs: [job] }));
  await page.route('**/api/v1/jobs?state=active', (route) => json(route, { jobs: [] }));
  await page.route('**/api/v1/budget/status', (route) => json(route, { unitLabel: 'coins' }));
  await page.route('**/api/v1/voice/token', (route) => json(route, { error: 'unavailable' }, 503));
  await page.route('**/api/v1/notifications/stream', (route) =>
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': connected\n\n' }),
  );
  await page.route('**/api/v1/jobs/*/checkpoints/budget', (route) => json(route, { used: 1, max: 3 }));
  await page.route('**/api/v1/jobs/*/chat*', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { text: string };
      return json(route, message('m_7', 'text', { actor: 'creator', text: body.text, at: new Date().toISOString() }));
    }
    const body = messages
      .map((value, index) => `id: ${index + 1}\nevent: message\ndata: ${JSON.stringify(value)}\n`)
      .join('\n');
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: `${body}\n` });
  });
  await page.route('**/media.example.test/**', async (route) => {
    if (route.request().url().includes('.mp4')) {
      return route.fulfill({ status: 200, contentType: 'video/mp4', body: '' });
    }
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#7b4f9d"/></svg>',
    });
  });
}

function message(id: string, kind: string, overrides: Record<string, unknown>) {
  return {
    id,
    job_id: jobId,
    at: '2026-11-01T09:12:30Z',
    actor: 'agent',
    kind,
    ...overrides,
  };
}

function media(url: string) {
  return { url, width: 640, height: 360 };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}
