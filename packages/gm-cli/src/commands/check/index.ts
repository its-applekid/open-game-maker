import type { GateResult, RunL0Options } from '@ogm/gm-verify';

import { EXIT, UsageError, type GmCommand, type GmContext } from '../../command.js';
import { command as assetsCommand } from './assets.js';

export function printGate(ctx: GmContext, result: GateResult): number {
  if (ctx.json) ctx.out(JSON.stringify(result));
  else {
    for (const check of result.checks.filter((item) => !item.ok)) {
      const location = check.file
        ? `${check.file}${check.line === undefined ? '' : `:${check.line}`} `
        : `${check.id} `;
      ctx.err(`${location}${check.detail ?? 'failed'}`);
    }
  }
  return result.ok ? EXIT.ok : EXIT.failed;
}

export async function runSelected(ctx: GmContext, checks: RunL0Options): Promise<number> {
  const verify = await import('@ogm/gm-verify');
  return printGate(ctx, verify.runL0(ctx.cwd, checks));
}

export const command: GmCommand = {
  name: 'check',
  summary: 'run deterministic static, hook, and asset gates',
  usage: '[--json]',
  example: 'check',
  flags: {},
  async run(ctx, args) {
    if (args.length > 0) throw new UsageError(`unexpected argument ${args[0]}`, 'gm help check');
    const verify = await import('@ogm/gm-verify');
    const gate = verify.runL0(ctx.cwd);

    const out: string[] = [];
    const err: string[] = [];
    const assetCode = await assetsCommand.run(
      { ...ctx, out: (line) => out.push(line), err: (line) => err.push(line) },
      [],
      {},
    );
    const gateCode = printGate(ctx, gate);
    if (assetCode !== EXIT.ok) {
      out.forEach(ctx.out);
      err.forEach(ctx.err);
    }
    return gateCode === EXIT.ok && assetCode === EXIT.ok ? EXIT.ok : EXIT.failed;
  },
};
