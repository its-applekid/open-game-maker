// node prototypes/ui-v0/tools/bake.mjs GoblinFighters/GoblinFighter_01 ...  (needs the repo served on :8765)
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const out = new URL('../site/assets/models/', import.meta.url);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
for (const kind of process.argv.slice(2)) {
  const page = await browser.newPage();
  page.on('console', m => console.log(`[${kind}]`, m.text()));
  await page.goto(`http://127.0.0.1:8765/prototypes/ui-v0/tools/bake-goblin.html?kind=${kind}`);
  await page.waitForFunction(() => window.__result, null, { timeout: 300000 });
  const b64 = await page.evaluate(() => window.__result);
  if (b64 === 'ERROR') { process.exitCode = 1; continue; }
  const file = new URL(kind.split('/')[1].toLowerCase().replace(/_/g, '-') + '.glb', out);
  writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log('wrote', file.pathname);
  await page.close();
}
await browser.close();
