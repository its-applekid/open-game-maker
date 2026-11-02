import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { renderSetupMarkdown } from '../dist/render/markdown.js';
import { loadSetupContent } from '../dist/schema.js';

const packageRoot = new URL('../', import.meta.url);
const repositoryRoot = new URL('../../../', import.meta.url);
const sourcePath = fileURLToPath(new URL('content/setup.yaml', packageRoot));
const targetPath = fileURLToPath(new URL('SETUP.md', repositoryRoot));
const content = loadSetupContent(sourcePath, fileURLToPath(repositoryRoot));
const generated = renderSetupMarkdown(content);

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
}
