import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { EXIT, UsageError, type GmCommand } from '../../command.js';
import { printJson } from '../../context.js';

type LockEntry = { id: string; path?: string; license?: string };

export const command: GmCommand = {
  name: 'assets list',
  summary: 'the assets this game uses, read from ./assets.lock.json',
  example: 'assets list --json',
  flags: {},
  async run(ctx) {
    const file = join(ctx.cwd, 'assets.lock.json');
    if (!existsSync(file)) {
      ctx.err('no assets.lock.json here');
      ctx.emit('assets.list', { entries: 0 });
      return EXIT.ok;
    }
    let entries: LockEntry[];
    try {
      entries = (JSON.parse(readFileSync(file, 'utf8')) as { assets?: LockEntry[] }).assets ?? [];
    } catch {
      throw new UsageError('assets.lock.json is not valid JSON', 'git diff assets.lock.json');
    }
    for (const entry of entries.slice(0, ctx.limit)) {
      if (ctx.json) printJson(ctx, entry);
      else ctx.out([entry.id, entry.path ?? '-', entry.license ?? '-'].join('  '));
    }
    if (!ctx.json && entries.length > ctx.limit)
      ctx.out(`+${entries.length - ctx.limit} more  (--limit ${entries.length})`);
    ctx.emit('assets.list', { entries: entries.length });
    return EXIT.ok;
  },
};
