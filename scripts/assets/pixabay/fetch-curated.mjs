// Slow, human-paced download of Pixabay curated-playlist music (Kevin, 2026-11-02).
// Usage: DISPLAY=:1 node fetch-curated.mjs <browser-profile-dir> <out-root> [start-url]
// - Uses a signed-in persistent Chromium profile (sign in once with login.mjs; credentials in ~/.config/ogm/pixabay.env).
// - One track at a time; random 45-240 s between tracks, longer pauses every few tracks; believable mouse moves and scrolls.
// - Writes <out-root>/<playlist-slug>/<file>.mp3 and <file>.json (id, title, artist, page, playlist, tags). Resumable: skips ids already on disk.
// - Never runs in parallel, never hits download URLs directly, never uses the API for audio (none exists).
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path';
const [,, profile, outRoot, start = 'https://pixabay.com/curated_playlists/'] = process.argv;
const rnd = (a, b) => a + Math.random() * (b - a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const have = new Set(); for (const d of fs.existsSync(outRoot) ? fs.readdirSync(outRoot) : []) for (const f of fs.readdirSync(path.join(outRoot, d))) { const m = f.match(/-(\d{5,})\.mp3$/); if (m) have.add(m[1]); }
const ctx = await chromium.launchPersistentContext(profile, { headless: false, acceptDownloads: true, viewport: { width: 1366, height: 900 }, ignoreDefaultArgs: ['--enable-automation'], args: ['--disable-blink-features=AutomationControlled'] });
const p = ctx.pages()[0] || await ctx.newPage();
async function human() {
  for (let i = 0, n = Math.floor(rnd(2, 6)); i < n; i++) { await p.mouse.move(rnd(80, 1280), rnd(80, 820), { steps: Math.floor(rnd(8, 30)) }); await sleep(rnd(200, 1200)); }
  for (let i = 0, n = Math.floor(rnd(1, 4)); i < n; i++) { await p.mouse.wheel(0, rnd(150, 600)); await sleep(rnd(500, 2000)); }
  if (Math.random() < 0.4) { await p.mouse.wheel(0, -rnd(200, 800)); await sleep(rnd(400, 1500)); }
}
async function go(url) { await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 }); await sleep(rnd(2500, 6000)); const c = p.locator('button:has-text("Accept Cookies")'); if (await c.count()) await c.first().click().catch(() => {}); await human(); }
async function links(re) { return [...new Set(await p.$$eval('a[href]', as => as.map(a => a.href)))].filter(u => re.test(u)); }
async function scrollAll() { for (let i = 0; i < 25; i++) { const h = await p.evaluate(() => document.body.scrollHeight); await p.mouse.wheel(0, rnd(700, 1400)); await sleep(rnd(700, 1800)); if (await p.evaluate(() => document.body.scrollHeight) === h && i > 4) break; } }
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
await go(start); await scrollAll();
const playlists = await links(/pixabay\.com\/playlists\/[^/]+-\d+\/?$/);
log('playlists', playlists.length);
let done = 0;
for (const pl of playlists) {
  const slug = pl.replace(/\/$/, '').split('/').pop();
  await go(pl); await scrollAll();
  const tracks = await links(/pixabay\.com\/music\/[a-z0-9-]+-\d{5,}\/?$/);
  log('playlist', slug, tracks.length, 'tracks');
  const dir = path.join(outRoot, slug); fs.mkdirSync(dir, { recursive: true });
  for (const t of tracks) {
    const id = t.replace(/\/$/, '').match(/-(\d{5,})$/)[1]; if (have.has(id)) continue;
    await go(t);
    const meta = await p.evaluate(() => ({ title: document.querySelector('h1')?.innerText?.trim(), tags: [...document.querySelectorAll('a[href*="/music/search/"]')].map(a => a.innerText.trim()).filter(Boolean).slice(0, 20) }));
    const btn = p.locator('button:has-text("Download"), a:has-text("Download")').first();
    if (!(await btn.count())) { log('no button', t); continue; }
    const box = await btn.boundingBox(); if (box) { await p.mouse.move(box.x + rnd(5, box.width - 5), box.y + rnd(4, box.height - 4), { steps: Math.floor(rnd(15, 40)) }); await sleep(rnd(300, 1100)); }
    try {
      const [d] = await Promise.all([p.waitForEvent('download', { timeout: 90000 }), btn.click()]);
      const f = path.join(dir, d.suggestedFilename()); await d.saveAs(f);
      fs.writeFileSync(f.replace(/\.mp3$/, '.json'), JSON.stringify({ id, page: t, playlist: pl, ...meta, file: path.basename(f), licence: 'Pixabay Content License', downloaded: new Date().toISOString() }, null, 1));
      have.add(id); done++; log('saved', path.basename(f));
    } catch (e) { log('miss', t, e.message.split('\n')[0]); }
    await sleep(rnd(45000, 240000) + (done % Math.floor(rnd(6, 12)) === 0 ? rnd(300000, 900000) : 0));
  }
}
log('DONE', done, 'new tracks'); await ctx.close();
