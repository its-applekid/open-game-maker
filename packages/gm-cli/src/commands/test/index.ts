import { resolve } from 'node:path';

import { UsageError, type GmCommand } from '../../command.js';
import { niceCapture } from '../run/index.js';
import { printGate } from '../check/index.js';

export const command: GmCommand = {
  name: 'test',
  summary: 'run the deterministic browser smoke gate',
  usage: '[--inputs script.json] [--ticks 3600] [--serve dist] [--json]',
  example: 'test --ticks 3600',
  flags: {
    inputs: { type: 'string', help: 'logical input script JSON' },
    ticks: { type: 'number', default: 3_600, help: 'fixed simulation ticks to advance' },
    serve: { type: 'string', default: 'dist', help: 'built game directory to serve on loopback' },
    out: { type: 'string', default: 'shots/test', help: 'gate report and HUD still directory' },
  },
  async run(ctx, args, flags) {
    if (args.length > 0) throw new UsageError(`unexpected argument ${args[0]}`, 'gm help test');
    const ticks = flags.ticks as number;
    if (ticks < 1) throw new UsageError('--ticks must be at least 1', 'gm test --ticks 3600');
    const verify = await import('@ogm/gm-verify');
    let inputs;
    if (typeof flags.inputs === 'string') {
      try {
        inputs = verify.readInputScript(resolve(ctx.cwd, flags.inputs));
      } catch (error) {
        const cause = error instanceof Error ? error.message.split('\n')[0] : String(error);
        throw new UsageError(`--inputs could not be read: ${cause}`, 'gm test --inputs script.json');
      }
    }

    niceCapture();
    const result = await verify.runL1(ctx.cwd, {
      serveDir: flags.serve as string,
      outDir: resolve(ctx.cwd, flags.out as string),
      ...(inputs ? { inputs } : {}),
      ticks,
      software: ctx.config.verifySoftwareGl,
      slots: { runtimeDir: ctx.config.runtimeDir },
      eventsFile: ctx.config.eventsFile,
      jobId: ctx.config.jobId,
      aiurIssue: ctx.config.aiurIssue,
      aiurRunId: ctx.config.aiurRunId,
      source: 'gm test',
    });
    const code = printGate(ctx, result);
    if (!ctx.json && result.ok && result.report) ctx.out(`${result.report}  L1 pass`);
    return code;
  },
};
