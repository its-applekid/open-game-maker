import { readFileSync } from 'node:fs';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { installAuthRoutes } from './fixtures/auth-routes';
import { mockGamesRoutes } from './fixtures/games-routes';
import { installNewRoutes } from './fixtures/new-routes';
import { installGameApi } from './support/mock-game-api';
import { attachComparison } from './support/visual-compare';

const referenceOrigin = 'http://127.0.0.1:43176';
const townStub = readFileSync(new URL('./fixtures/town-stub/index.html', import.meta.url), 'utf8');
const neutralImage = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="788"><rect width="1400" height="788" fill="#6b6570"/></svg>',
);
const neutralPoster = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><rect width="1280" height="800" fill="#6b6570"/></svg>',
);

const viewports = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;
const scenarios = [
  { name: 'title', threshold: 0.25, prepare: prepareTitle },
  { name: 'games', threshold: 0.21, prepare: prepareGames },
  { name: 'creation-option', threshold: 0.08, prepare: prepareCreationOption },
  { name: 'creation-talk', threshold: 0.14, prepare: prepareCreationTalk },
  { name: 'editor', threshold: 0.16, prepare: prepareEditor },
] as const;

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.describe.configure({ mode: 'serial' });

for (const scenario of scenarios) {
  for (const viewport of viewports) {
    test(`${scenario.name} matches the prototype shell at ${viewport.width}x${viewport.height}`, async ({
      browser,
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'the test sets both exact acceptance viewports itself');
      test.setTimeout(30_000);
      const referenceContext = await browser.newContext({
        viewport,
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
      });
      const reference = await referenceContext.newPage();
      const appErrors: string[] = [];
      const failedResponses: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
          appErrors.push(message.text());
        }
      });
      page.on('pageerror', (error) => appErrors.push(error.message));
      page.on('response', (response) => {
        const expectedVoiceFallback = response.url().endsWith('/api/v1/voice/token') && response.status() === 503;
        const pathname = new URL(response.url()).pathname;
        const expectedMissingGameResource =
          response.status() === 404 && ['/api/v1/games/game/published', '/api/v1/games/game/saves'].includes(pathname);
        if (response.status() >= 400 && !expectedVoiceFallback && !expectedMissingGameResource) {
          failedResponses.push(`${response.status()} ${response.url()}`);
        }
      });

      try {
        await page.setViewportSize(viewport);
        const masks = await test.step('prepare app and prototype', () => scenario.prepare(page, reference));
        await test.step('normalize pages', () => Promise.all([normalize(page), normalize(reference)]));
        // Capture through CDP after normalization. Playwright's screenshot helper waits
        // on every web font, including the intentionally unavailable prototype fonts.
        const referenceShot = await test.step('capture prototype', () => capture(reference, masks.reference));
        const appShot = await test.step('capture app', () => capture(page, masks.app));
        const artifactName = `${scenario.name}-${viewport.name}`;
        const score = await attachComparison(testInfo, artifactName, referenceShot, appShot);
        testInfo.annotations.push({
          type: 'visual-score',
          description: `${score.toFixed(4)} <= ${scenario.threshold}`,
        });
        expect(score, `${artifactName} normalized shell distance`).toBeLessThanOrEqual(scenario.threshold);
        expect(appErrors, `${artifactName} app console errors`).toEqual([]);
        expect(failedResponses, `${artifactName} failed responses`).toEqual([]);
      } finally {
        await referenceContext.close();
      }
    });
  }
}

type Masks = { app: ReturnType<Page['locator']>[]; reference: ReturnType<Page['locator']>[] };

async function capture(page: Page, masks: Locator[]): Promise<Buffer> {
  const elements = (await Promise.all(masks.map((mask) => mask.all()))).flat();
  const boxes = (await Promise.all(elements.map((element) => element.boundingBox()))).filter((box) => box !== null);
  await page.evaluate((rectangles) => {
    for (const rectangle of rectangles) {
      const mask = document.createElement('div');
      mask.dataset.visualMask = '';
      Object.assign(mask.style, {
        position: 'fixed',
        left: `${rectangle.x}px`,
        top: `${rectangle.y}px`,
        width: `${rectangle.width}px`,
        height: `${rectangle.height}px`,
        background: '#6b6570',
        zIndex: '2147483647',
        pointerEvents: 'none',
      });
      document.body.append(mask);
    }
  }, boxes);
  const session = await page.context().newCDPSession(page);
  try {
    const { data } = await session.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    return Buffer.from(data, 'base64');
  } finally {
    await session.detach();
    await page.locator('[data-visual-mask]').evaluateAll((elements) => {
      for (const element of elements) element.remove();
    });
  }
}

async function prepareTitle(app: Page, reference: Page): Promise<Masks> {
  await Promise.all([
    neutralizeAppAssets(app),
    neutralizeReferenceAssets(reference),
    installAuthRoutes(app, { signedIn: true }),
  ]);
  await app.route('**/town/index.html*', (route) => route.fulfill({ contentType: 'text/html', body: townStub }));
  await Promise.all([
    app.goto('/?test', { waitUntil: 'domcontentloaded' }),
    reference.goto(`${referenceOrigin}/studio/index.html`, { waitUntil: 'domcontentloaded' }),
  ]);
  await showStudioScreen(reference, 's-title');
  await app.locator('.title-town').evaluate((town) => {
    town.replaceChildren();
    (town as HTMLElement).style.background = '#6b6570';
  });
  await Promise.all([
    expect(app.getByRole('button', { name: 'Start', exact: true })).toBeVisible(),
    expect(reference.locator('#t-start')).toBeVisible(),
  ]);
  await reference.locator('#s-title .t-scene').evaluate((scene) => {
    scene.replaceChildren();
    (scene as HTMLElement).style.background = '#6b6570';
  });
  return { app: [], reference: [] };
}

async function prepareGames(app: Page, reference: Page): Promise<Masks> {
  await Promise.all([neutralizeAppAssets(app), neutralizeReferenceAssets(reference)]);
  await installAuthRoutes(app, { signedIn: true });
  await mockGamesRoutes(app);
  await app.route('**/api/v1/jobs?gameId=*', (route) => route.fulfill({ json: { jobs: [] } }));
  await app.route('**/api/v1/budget/status', (route) => route.fulfill({ json: { unitLabel: 'coins' } }));
  await Promise.all([
    app.goto('/games?test&spotlight=g_2', { waitUntil: 'domcontentloaded' }),
    reference.goto(`${referenceOrigin}/studio/index.html`, { waitUntil: 'domcontentloaded' }),
  ]);
  await prepareReferenceGames(reference);
  await Promise.all([
    expect(app.getByRole('heading', { name: 'Goblin Cellar' })).toBeVisible(),
    expect(reference.locator('.lh-title')).toHaveText('Goblin Cellar'),
  ]);
  return {
    app: [app.locator('.games-spotlight-media'), app.locator('.game-cover-image, .game-cover-placeholder')],
    reference: [reference.locator('#lh-shot'), reference.locator('.tile canvas')],
  };
}

async function prepareCreationOption(app: Page, reference: Page): Promise<Masks> {
  await Promise.all([neutralizeAppAssets(app), neutralizeReferenceAssets(reference)]);
  await installAuthRoutes(app, { signedIn: true });
  await installNewRoutes(app);
  await Promise.all([
    app.goto('/new?test&step=genre', { waitUntil: 'domcontentloaded' }),
    reference.goto(`${referenceOrigin}/studio/index.html`, { waitUntil: 'domcontentloaded' }),
  ]);
  await prepareReferenceCreationOption(reference);
  const appChoice = app.getByRole('button', { name: 'Adventure' });
  const referenceChoice = reference.getByRole('button', { name: 'Adventure' });
  await appChoice.click();
  await referenceChoice.evaluate((button) => button.setAttribute('aria-pressed', 'true'));
  await Promise.all([
    expect(appChoice).toHaveAttribute('aria-pressed', 'true'),
    expect(referenceChoice).toHaveAttribute('aria-pressed', 'true'),
  ]);
  return { app: [], reference: [] };
}

async function prepareCreationTalk(app: Page, reference: Page): Promise<Masks> {
  await Promise.all([neutralizeAppAssets(app), neutralizeReferenceAssets(reference)]);
  await installAuthRoutes(app, { signedIn: true });
  await installNewRoutes(app);
  await Promise.all([
    app.goto('/new?test&step=talk', { waitUntil: 'domcontentloaded' }),
    reference.goto(`${referenceOrigin}/studio/index.html`, { waitUntil: 'domcontentloaded' }),
  ]);
  await prepareReferenceCreationTalk(reference);
  await Promise.all([
    expect(app.getByRole('heading', { name: 'Talk it through' })).toBeVisible(),
    expect(reference.locator('#wz-title')).toHaveText('Talk it through'),
    expect(app.locator('.talk-host .vs')).toBeVisible(),
    expect(reference.locator('.talk-host .vs')).toBeVisible(),
  ]);
  return {
    app: [app.locator('.scope-seis, .scope-orb')],
    reference: [reference.locator('.seis, .orb')],
  };
}

async function prepareEditor(app: Page, reference: Page): Promise<Masks> {
  await Promise.all([neutralizeAppAssets(app), neutralizeReferenceAssets(reference)]);
  await installAuthRoutes(app, { signedIn: true });
  await installGameApi(app);
  await app.route('**/api/v1/games/game/branches', (route) => route.fulfill({ json: { branches: [] } }));
  await app.route('**/api/v1/games', (route) => route.fulfill({ json: { games: [] } }));
  await app.route('**/api/v1/budget/status', (route) => route.fulfill({ json: { unitLabel: 'coins' } }));
  await Promise.all([
    app.goto('/g/game?mode=edit&test', { waitUntil: 'domcontentloaded' }),
    reference.goto(`${referenceOrigin}/ui/index.html`, { waitUntil: 'domcontentloaded' }),
  ]);
  await reference.evaluate(() => {
    const home = document.querySelector<HTMLElement>('#home');
    const editor = document.querySelector<HTMLElement>('#editor');
    const loading = document.querySelector<HTMLElement>('#loading');
    const title = document.querySelector<HTMLInputElement>('#title');
    if (home) home.hidden = true;
    if (editor) {
      editor.hidden = false;
      editor.classList.remove('pre');
    }
    if (loading) loading.hidden = true;
    if (title) title.value = 'Goblin Cellar';
  });
  await Promise.all([
    expect(app.locator('.editor-chrome')).toBeAttached(),
    expect(reference.locator('#editor')).toBeVisible(),
  ]);
  return { app: [app.locator('.game-stage')], reference: [reference.locator('#stage')] };
}

async function neutralizeAppAssets(page: Page): Promise<void> {
  await neutralizeFonts(page);
  await page.route(/\/art\/.*\.(?:png|jpe?g|webp|gif)$/i, (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: neutralImage }),
  );
  await page.route('**/town/models/bake/poster-*', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: neutralPoster }),
  );
}

async function neutralizeReferenceAssets(page: Page): Promise<void> {
  await neutralizeFonts(page);
  await page.route(/127\.0\.0\.1:43176\/(?:studio|ui)\/.*\.js$/i, (route) => route.abort());
  await page.route(/127\.0\.0\.1:43176\/(?:studio|ui)\/.*\.(?:png|jpe?g|webp|gif)$/i, (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: neutralImage }),
  );
}

async function normalize(page: Page): Promise<void> {
  await page.locator('link[href*="fonts.googleapis.com"], link[href*="fonts.gstatic.com"]').evaluateAll((links) => {
    for (const link of links) link.remove();
  });
  await page.addStyleTag({
    content: `
      *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
      html, body, button, input, textarea { font-family: Arial, sans-serif !important; }
      #bg canvas, .studio-backdrop canvas { visibility: hidden !important; }
      #bg, .studio-backdrop { background: #0f0e16 !important; }
    `,
  });
}

async function neutralizeFonts(page: Page): Promise<void> {
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ contentType: 'text/css; charset=utf-8', body: '' }),
  );
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
}

async function showStudioScreen(page: Page, id: 's-title' | 's-library' | 's-wizard'): Promise<void> {
  await page.evaluate((screenId) => {
    for (const screen of document.querySelectorAll<HTMLElement>('.screen')) screen.hidden = screen.id !== screenId;
    document.body.classList.toggle('on-title', screenId === 's-title');
    document.body.classList.remove('on-play', 'builds-on');
    document.querySelector<HTMLElement>('#tracker')?.classList.add('hidden');
  }, id);
}

async function prepareReferenceGames(page: Page): Promise<void> {
  await showStudioScreen(page, 's-library');
  await page.evaluate(() => {
    const hero = document.querySelector<HTMLElement>('#lib-hero');
    const text = document.querySelector<HTMLElement>('#lh-text');
    const grid = document.querySelector<HTMLElement>('#lib-grid');
    if (!hero || !text || !grid) throw new Error('prototype library shell is missing');
    hero.hidden = false;
    hero.style.setProperty('--c', '#fabd2f');
    text.innerHTML = `
      <h2 class="lh-title">Goblin Cellar</h2>
      <p class="lh-tag">Sneak through a cellar full of hungry goblins.</p>
      <ul class="lh-icons"><li><span>◆</span>Adventure</li><li><span>★</span>Cozy</li><li><span>▦</span>Pixel</li></ul>
      <dl class="lh-stats"><div><dt>Time played</dt><dd>42m</dd></div><div><dt>Rating</dt><dd>4.8</dd></div><div><dt>Version</dt><dd>v1.2.0</dd></div><div><dt>Plays</dt><dd>12</dd></div></dl>
      <div class="lh-acts"><button class="act play" aria-label="Play">▶</button><button class="act edit" aria-label="Edit">✎</button></div>`;
    grid.innerHTML = ['Midnight Crumbs', 'Goblin Cellar', 'Skyward Squadron']
      .map(
        (title, index) => `<button class="tile${index === 1 ? ' sel' : ''}" aria-label="${title}" style="--c:#fabd2f;--i:${index}">
          <canvas></canvas><span class="shine"></span><span class="tile-info"><span class="cover-title">${title}</span><span class="tile-meta"><span class="ticons">◆ ★</span><span class="stars">★ 4.${index + 6}</span></span></span>
        </button>`,
      )
      .join('');
  });
}

async function prepareReferenceCreationOption(page: Page): Promise<void> {
  await showStudioScreen(page, 's-wizard');
  await page.evaluate(() => {
    const title = document.querySelector<HTMLElement>('#wz-title');
    const ask = document.querySelector<HTMLElement>('#wz-ask');
    const hint = document.querySelector<HTMLElement>('#wz-hint');
    const dots = document.querySelector<HTMLElement>('#wz-dots');
    const body = document.querySelector<HTMLElement>('#wz-body');
    const next = document.querySelector<HTMLElement>('#wz-next');
    if (!title || !ask || !hint || !dots || !body || !next) throw new Error('prototype wizard shell is missing');
    title.textContent = 'Genre';
    ask.textContent = 'What kind of game is it?';
    hint.textContent = 'Pick up to 3';
    dots.innerHTML = '<i class="now"></i><i></i><i></i><i></i><i></i><i></i><i></i>';
    dots.setAttribute('aria-label', 'Step 1 of 7');
    body.dataset.step = 'genre';
    body.innerHTML = `<div class="opt-grid" role="group" aria-label="What kind of game is it?">
      ${['Shooter', 'Adventure', 'RPG', 'Sports', 'Racing', 'Strategy', 'Puzzle', 'Battle', 'Platformer', 'Sim', 'Roguelike', 'Craft', 'TCG', 'Rhythm']
        .map((label) => `<button class="opt" aria-pressed="false"><span class="ic">◆</span><span class="lb">${label}</span></button>`)
        .join('')}
      <div class="opt other"><button class="other-face"><span class="ic">＋</span><span class="lb">Other</span></button></div>
    </div>`;
    next.hidden = false;
    next.textContent = 'Skip';
  });
}

async function prepareReferenceCreationTalk(page: Page): Promise<void> {
  await showStudioScreen(page, 's-wizard');
  await page.evaluate(() => {
    const title = document.querySelector<HTMLElement>('#wz-title');
    const ask = document.querySelector<HTMLElement>('#wz-ask');
    const hint = document.querySelector<HTMLElement>('#wz-hint');
    const dots = document.querySelector<HTMLElement>('#wz-dots');
    const body = document.querySelector<HTMLElement>('#wz-body');
    const next = document.querySelector<HTMLElement>('#wz-next');
    if (!title || !ask || !hint || !dots || !body || !next) throw new Error('prototype wizard shell is missing');
    title.textContent = 'Talk it through';
    ask.textContent = 'Tell the builder about your game';
    hint.textContent = 'Talk or type. Press Finish whenever you have said enough.';
    dots.innerHTML = '<i class="done"></i><i class="done"></i><i class="done"></i><i class="done"></i><i class="done"></i><i class="done"></i><i class="now"></i>';
    dots.setAttribute('aria-label', 'Step 7 of 7');
    body.dataset.step = 'talk';
    body.innerHTML = `<div class="pick-sum"><span class="sum-row muted">No picks yet. That is fine: just tell the builder about your game.</span></div>
      <div class="talk-host"><div class="vs two">
        <section class="vs-side you" aria-label="You"><header><span class="who">You</span><span class="state">Ready</span></header><canvas class="seis"></canvas><div class="caption"></div></section>
        <section class="vs-side agent" aria-label="Builder"><header><span class="who">Builder</span><span class="state">Waiting</span></header><canvas class="orb"></canvas><div class="caption"></div></section>
        <form class="vs-type" hidden><textarea aria-label="Type instead"></textarea><button class="btn small">Send</button></form>
        <footer class="vs-controls"><button class="btn mic"><span class="ic">●</span><span>Start talking</span></button><button class="btn ghost typebtn">✎ Type instead</button><span class="grow"></span><button class="btn green finish">Finish</button></footer>
      </div></div>`;
    next.hidden = true;
  });
}
