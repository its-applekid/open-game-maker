import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Hono } from 'hono';

import type { ApiBindings, AppDeps } from './types.js';

type RoutesModule = {
  default?: unknown;
  prefix?: unknown;
  setup?: unknown;
};

const contextName = /^[a-z][a-z0-9-]*$/;
// tsx/vitest run src (routes.ts); production runs dist (routes.js).
const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js';

// Mounts every `<root>/<context>/routes.<ext>` in name order. Its default export is a Hono app,
// mounted at `export const prefix` or `/api/v1/<context>`; an optional `setup(deps)` runs first
// (resolver registration, event subscriptions). Nothing else under a context can mount.
export async function scanRoutes(
  app: Hono<ApiBindings>,
  opts: { deps: AppDeps; root?: URL },
): Promise<{ mounted: { prefix: string; file: string }[] }> {
  const root = fileURLToPath(opts.root ?? new URL('../', import.meta.url));
  const mounted: { prefix: string; file: string }[] = [];

  const contexts = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'app' && contextName.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  for (const context of contexts) {
    const file = `${root}/${context}/routes.${extension}`;
    if (!existsSync(file)) continue;

    const module = (await import(pathToFileURL(file).href)) as RoutesModule;
    if (!(module.default instanceof Hono)) throw new Error(`${file}: default export must be a Hono app`);
    const prefix = module.prefix ?? `/api/v1/${context}`;
    if (typeof prefix !== 'string' || !prefix.startsWith('/')) throw new Error(`${file}: prefix must start with /`);
    if (mounted.some((entry) => entry.prefix === prefix))
      throw new Error(`${file}: prefix ${prefix} is already mounted`);
    if (module.setup !== undefined && typeof module.setup !== 'function') {
      throw new Error(`${file}: setup must be a function`);
    }

    (module.setup as ((deps: AppDeps) => void) | undefined)?.(opts.deps);
    app.route(prefix, module.default as Hono<ApiBindings>);
    mounted.push({ prefix, file: `${context}/routes.${extension}` });
  }

  return { mounted };
}
