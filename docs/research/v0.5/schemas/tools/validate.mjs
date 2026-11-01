// Compatibility shim. Usage remains: node validate.mjs <ignored schemas dir> [files...]
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const launcher = new URL('../../../../../packages/contracts/bin/validate-cards.mjs', import.meta.url);
console.error(
  'validate.mjs moved to packages/contracts/bin/validate-cards.mjs; the schemas-dir argument is ignored',
);
const result = spawnSync(process.execPath, [fileURLToPath(launcher), ...process.argv.slice(3)], {
  stdio: 'inherit',
});
process.exit(result.status ?? 2);
