// node perf.mjs <path> [css-to-inject]  -> frames rendered in 3s after 3s settle, with optional CSS override
import { chromium } from 'playwright';
const [, , path, css = ''] = process.argv;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:8765/${path}`);
if (css) await page.addStyleTag({ content: css });
await page.waitForTimeout(3000);
const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 3000 ? requestAnimationFrame(f) : r(n / 3); }; requestAnimationFrame(f); }));
const nodes = await page.evaluate(() => document.querySelectorAll('#home svg *').length);
console.log(JSON.stringify({ css: css.slice(0, 60), fps: +fps.toFixed(1), svgNodes: nodes }));
await browser.close();
