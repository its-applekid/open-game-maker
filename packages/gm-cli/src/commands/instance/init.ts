import { chmodSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { renderInstanceTemplate } from '@ogm/game-repo-template';

import { EXIT, UsageError, type GmCommand } from '../../command.js';
import { isEmptyDirectory } from '../../filesystem.js';

export const command: GmCommand = {
  name: 'instance init',
  summary: 'initialize an instance repository with games and shared packages',
  usage: '<dir>',
  example: 'instance init my-games',
  flags: {},
  async run(ctx, args) {
    if (args.length !== 1) throw new UsageError('gm instance init needs a directory', 'gm help instance init');
    const destination = resolve(ctx.cwd, args[0]!);
    if (existsSync(destination) && !isEmptyDirectory(destination)) {
      throw new UsageError(`destination is not empty: ${destination}`, 'choose an empty directory');
    }

    mkdirSync(dirname(destination), { recursive: true });
    const staging = mkdtempSync(join(dirname(destination), '.gm-instance-stage-'));
    try {
      for (const file of renderInstanceTemplate().files) {
        const target = join(staging, file.path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, file.content);
        if (file.mode === '100755') chmodSync(target, 0o755);
      }
      if (existsSync(destination)) rmdirSync(destination);
      renameSync(staging, destination);
    } finally {
      if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    }

    ctx.out(`initialized ${destination}. Next: cd ${destination} && pnpm install`);
    ctx.emit('instance.init', { path: destination });
    return EXIT.ok;
  },
};
