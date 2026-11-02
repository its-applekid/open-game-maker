import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { EXIT, UsageError, type GmCommand } from '../../command.js';
import { locateSkillPack, syncSkillPack } from '../../skills/pack.js';

function recordedSet(repoDir: string): string | undefined {
  const lockPath = join(repoDir, 'gm.lock.json');
  if (!existsSync(lockPath)) return undefined;
  let lock: unknown;
  try {
    lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch {
    throw new UsageError('gm.lock.json is not valid JSON', 'repair the creation lock before syncing skills');
  }
  if (!lock || typeof lock !== 'object' || !('set' in lock)) return undefined;
  const set = (lock as { set?: unknown }).set;
  if (typeof set !== 'string' || !/^[a-z0-9-]+$/.test(set)) {
    throw new UsageError('gm.lock.json has an invalid set', 'choose a registered lowercase set id');
  }
  return set;
}

export const command: GmCommand = {
  name: 'skills sync',
  summary: 'refresh the committed Game Maker skill pack without clobbering local edits',
  usage: '[--check] [--force]',
  example: 'skills sync --check',
  flags: {
    check: { type: 'boolean', default: false, help: 'report drift without writing' },
    force: { type: 'boolean', default: false, help: 'replace locally edited installed pack files' },
  },
  async run(ctx, args, flags) {
    if (args.length > 0) throw new UsageError('gm skills sync takes no arguments', 'gm help skills sync');
    const result = syncSkillPack({
      repoDir: ctx.cwd,
      packDir: locateSkillPack(ctx.cwd, ctx.skillsDir),
      set: recordedSet(ctx.cwd),
      checkOnly: flags.check === true,
      force: flags.force === true,
    });
    if (ctx.json) ctx.out(JSON.stringify(result));
    else if (result.actions.length > 0) result.actions.forEach(ctx.out);
    else ctx.out('skills up to date');
    ctx.emit('skills.sync', { check: flags.check === true, changed: result.changed, drift: result.drift });
    return flags.check === true && result.drift ? EXIT.failed : EXIT.ok;
  },
};
