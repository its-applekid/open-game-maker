import { statSync } from 'node:fs';
import { resolve } from 'node:path';

import { EXIT, UsageError, type GmCommand } from '../../command.js';
import { printJson } from '../../context.js';
import { niceCapture } from './index.js';

export const command: GmCommand = {
  name: 'verify serve',
  summary: 'host runner for sandboxed gm run filesystem requests',
  usage: '--workspaces DIR [--once]',
  example: 'verify serve --workspaces ~/.local/share/ogm/workspaces',
  flags: {
    workspaces: { type: 'string', help: 'directory whose children are game workspaces' },
    once: { type: 'boolean', default: false, help: 'process pending requests and exit' },
    poll: { type: 'number', default: 2_000, help: 'poll interval in milliseconds' },
  },
  async run(ctx, args, flags) {
    if (args.length > 0) throw new UsageError(`unexpected argument ${args[0]}`, 'gm help verify serve');
    if (typeof flags.workspaces !== 'string')
      throw new UsageError('--workspaces is required', 'gm verify serve --workspaces ~/.local/share/ogm/workspaces');
    if (!Number.isFinite(flags.poll as number) || (flags.poll as number) < 100)
      throw new UsageError('--poll must be at least 100 milliseconds', 'gm verify serve --workspaces DIR --poll 2000');
    const root = resolve(ctx.cwd, flags.workspaces);
    try {
      if (!statSync(root).isDirectory()) throw new Error('not a directory');
    } catch {
      throw new UsageError(
        `workspaces directory does not exist: ${flags.workspaces}`,
        'gm verify serve --workspaces DIR',
      );
    }
    niceCapture();

    const abort = new AbortController();
    const stop = () => abort.abort();
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    try {
      const verify = await import('@ogm/gm-verify');
      const reports = await verify.serveQueue(root, {
        runner: verify.runVerify,
        software: ctx.config.verifySoftwareGl,
        slots: { runtimeDir: ctx.config.runtimeDir },
        eventsFile: ctx.config.eventsFile,
        once: flags.once === true,
        pollMs: flags.poll as number,
        signal: abort.signal,
        log: ctx.json ? undefined : ctx.out,
      });
      if (ctx.json) for (const report of reports) printJson(ctx, report);
      return reports.some((report) => report.verdict !== 'pass') ? EXIT.failed : EXIT.ok;
    } finally {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
    }
  },
};
