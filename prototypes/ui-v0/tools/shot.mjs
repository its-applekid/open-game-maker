// node shot.mjs <path-under-repo> <out.png> [waitFor-js] [w] [h]  -> screenshot + console, prints window.__info
import { chromium } from 'playwright';
const [, , path, out, wait = 'window.__info', w = 1280, h = 800] = process.argv;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', m => { if (m.type() !== 'debug') console.log('[console]', m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:8765/${path}`);
await page.waitForFunction(wait, null, { timeout: 120000 });
await page.waitForTimeout(+(process.env.DELAY || 0));
const info = await page.evaluate(() => window.__info);
if (info) console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: out, timeout: 90000 });
await browser.close();
