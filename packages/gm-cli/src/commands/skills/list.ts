import { EXIT, UsageError, type GmCommand } from '../../command.js';
import { installedSkills } from '../../skills/pack.js';

export const command: GmCommand = {
  name: 'skills list',
  summary: 'list skills installed in this game repo',
  flags: {},
  async run(ctx, args) {
    if (args.length > 0) throw new UsageError('gm skills list takes no arguments', 'gm help skills list');
    const rows = installedSkills(ctx.cwd);
    if (rows.length === 0) {
      ctx.err('no skills.lock here');
      return EXIT.ok;
    }
    for (const row of rows.slice(0, ctx.limit)) ctx.out(ctx.json ? JSON.stringify(row) : `${row.name}  ${row.version}`);
    if (!ctx.json && rows.length > ctx.limit) ctx.out(`+${rows.length - ctx.limit} more  (--limit ${rows.length})`);
    return EXIT.ok;
  },
};
