import { readTemplate } from './files.js';

// OGM-034's `DaemonFiles`: written to the daemon directory's `.aiur/`, never committed.
export type DaemonFiles = { hooks: string; prompt: string };

// The same text for every game repo: the hook reads the repo, ticket and secret path from aiur's and the unit's env.
export function renderDaemonFiles(): DaemonFiles {
  return { hooks: readTemplate('hooks.sh'), prompt: readTemplate('prompt.md.liquid') };
}
