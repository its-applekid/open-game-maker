import { cp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { renderSplashHtml } from '../dist/render/html.js';
import { renderSetupMarkdown } from '../dist/render/markdown.js';
import { loadSetupContent } from '../dist/schema.js';
import { loadSplashContent } from '../dist/splash.js';

const packageRoot = new URL('../', import.meta.url);
const repositoryRoot = new URL('../../../', import.meta.url);
const sourcePath = fileURLToPath(new URL('content/setup.yaml', packageRoot));
const targetPath = fileURLToPath(new URL('SETUP.md', repositoryRoot));
const content = loadSetupContent(sourcePath, fileURLToPath(repositoryRoot));
const generated = renderSetupMarkdown(content);
const splash = loadSplashContent(fileURLToPath(new URL('content/splash.yaml', packageRoot)));

if (process.argv.includes('--check')) {
  let current;
  try {
    current = await readFile(targetPath, 'utf8');
  } catch {
    throw new Error('Generated SETUP.md is missing; run pnpm --filter @ogm/site build');
  }

  if (current !== generated) {
    throw new Error('Generated SETUP.md is stale; run pnpm --filter @ogm/site build');
  }
} else {
  await writeFile(targetPath, generated);

  // the site shares dist/ with tsc's output; tools/deploy.sh publishes only the site files
  const site = fileURLToPath(new URL('dist/', packageRoot));
  await cp(fileURLToPath(new URL('public/', packageRoot)), site, { recursive: true });
  await cp(fileURLToPath(new URL('apps/web/src/tokens.css', repositoryRoot)), `${site}tokens.css`);
  await cp(fileURLToPath(new URL('src/page/site.css', packageRoot)), `${site}site.css`);
  await writeFile(`${site}index.html`, renderSplashHtml(splash));
}
