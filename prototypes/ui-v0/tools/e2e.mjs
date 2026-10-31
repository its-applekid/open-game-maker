// Drive the whole loop: edit -> place goblin -> select -> play -> fight -> result -> back to edit. Screenshots per step.
import { chromium, devices } from 'playwright';
const OUT = process.env.OUT || '/tmp';
const mobile = process.argv.includes('--mobile');
const base = process.env.BASE || 'http://127.0.0.1:8765/prototypes/ui-v0/site/index.html';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext(mobile ? { ...devices['iPhone 13'], defaultBrowserType: undefined } : { viewport: { width: +(process.env.W || 960), height: +(process.env.H || 600) } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => { errors.push(e.message); console.log('[pageerror]', e.message); });
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text().slice(0, 200)); });
const shot = async n => { try { await page.screenshot({ path: `${OUT}/${mobile ? 'm-' : ''}${n}.png`, timeout: 60000 }); console.log('shot', n); } catch { console.log('shot SKIPPED (timeout)', n); } };
const t0 = Date.now(); const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

await page.goto(base + (process.argv.includes('--home') ? '' : '?editor'));
if (process.argv.includes('--home')) {
  await page.waitForFunction(() => document.querySelector('#home.in')); await page.waitForTimeout(3500); await shot('01-home');
  await page.click('#start'); await page.waitForTimeout(700); await shot('02-transition');
}
await page.waitForFunction(() => document.querySelector('#loading').hidden && window.__ogm, null, { timeout: 120000 });
log('editor ready'); await page.waitForTimeout(1500); await shot('03-editor');
await page.evaluate(() => localStorage.removeItem('ogm-map'));

// place a Goblin Chief on tile (7,3)
await page.click('.item[data-id="goblin3"]');
const [x, y] = await page.evaluate(() => window.__ogm.tileToScreen(7, 3));
await page.mouse.move(x, y); await page.waitForTimeout(200);
await page.mouse.click(x, y); await page.waitForTimeout(900);
const placed = await page.evaluate(() => window.__ogm.map.objects.filter(o => o.type === 'goblin3').length);
log('goblin3 placed:', placed); await shot('04-placed');
// switch to Decor and paint a wall
await page.click('#rail [data-cat="build"]'); await page.click('.item[data-id="wall"]');
const [wx, wy] = await page.evaluate(() => window.__ogm.tileToScreen(4, 3));
await page.mouse.click(wx, wy); await page.waitForTimeout(300);
log('tile (4,3) =', await page.evaluate(() => window.__ogm.map.tiles[3][4]));
await page.click('#undo'); await page.waitForTimeout(300);
log('after undo tile (4,3) =', await page.evaluate(() => window.__ogm.map.tiles[3][4]));
// select the chest -> it opens
await page.click('#rail [data-cat="treasure"]'); await page.click('.item.on').catch(() => {});
await page.keyboard.press('Escape');
const [cx, cy] = await page.evaluate(() => window.__ogm.tileToScreen(10, 1, .25));
await page.mouse.click(cx, cy); await page.waitForTimeout(900); await shot('05-chest-selected');

// PLAY
await page.click('#play'); await page.waitForTimeout(1200); log('mode', await page.evaluate(() => window.__ogm.mode)); await shot('06-play');
// walk with keys: hold W for 0.7 s of game time
await page.keyboard.down('w'); await page.evaluate(() => window.__ogm.tick(.7)); await page.keyboard.up('w');
log('player at', await page.evaluate(() => window.__ogm.player.root.position.toArray().map(v => +v.toFixed(2))));
// teleport next to each goblin and swing until it drops (game time advanced with tick)
for (let round = 0; round < 12; round++) {
  const left = await page.evaluate(() => window.__ogm.foes.filter(f => f.state !== 'dead').length); if (!left) break;
  await page.evaluate(() => { const f = window.__ogm.foes.find(f => f.state !== 'dead'); const p = window.__ogm.player; p.root.position.set(f.r.position.x, 0, f.r.position.z + .8); p.facing.set(0, 0, -1); });
  for (let i = 0; i < 3; i++) { await page.keyboard.press(' '); await page.evaluate(() => window.__ogm.tick(.5)); }
  if (round === 0) await shot('07-fight');
  log('round', round, await page.evaluate(() => window.__ogm.foes.map(f => `${f.o.type}:${f.state}:${f.hp}`).join(' ')), 'hp', await page.evaluate(() => window.__ogm.player.hp));
}
await page.evaluate(() => window.__ogm.tick(1.5)); await page.waitForTimeout(1500);
// beating the goblins must not end the run: the player keeps control until the chest is opened
log('after goblins: result visible', await page.evaluate(() => !document.querySelector('#result').hidden), 'hud', await page.evaluate(() => document.querySelector('#goblinsLeft').textContent));
await page.evaluate(() => { const c = window.__ogm.map.objects.find(o => o.type === 'chest'); window.__ogm.player.root.position.set(c.x, 0, c.z + 1); });
await page.keyboard.press('e'); await page.evaluate(() => window.__ogm.tick(.5)); await page.waitForTimeout(2500);
log('result visible', await page.evaluate(() => !document.querySelector('#result').hidden), await page.evaluate(() => document.querySelector('#resultTitle').textContent)); await shot('08-result');
await page.click('#backEdit'); await page.waitForTimeout(1200);
log('mode', await page.evaluate(() => window.__ogm.mode), 'goblins in map', await page.evaluate(() => window.__ogm.map.objects.filter(o => o.type.startsWith('goblin')).length));
await shot('09-back-to-edit');
console.log('ERRORS', errors.length);
await browser.close();
