import { constants, openSync, closeSync, readFileSync, realpathSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { AgentOutboxLine, AgreedScope } from '@ogm/contracts';
import { ulid } from 'ulid';

import { EXIT, UsageError, type GmCommand } from '../../command.js';
import { appendOutboxLine, jobContext } from '../../outbox.js';

function stringFlag(flags: Record<string, unknown>, name: string): string | undefined {
  return typeof flags[name] === 'string' ? flags[name] : undefined;
}

function readScope(root: string, requested: string) {
  let path: string;
  let handle: number | undefined;
  try {
    path = realpathSync(resolve(root, requested));
    const fromRoot = relative(realpathSync(root), path);
    if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
      throw new UsageError('scope file must be inside the workspace', 'copy it to .gm/scope/<session-id>.json');
    }
    handle = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const raw = JSON.parse(readFileSync(handle, 'utf8')) as unknown;
    const parsed = AgreedScope.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path.length ? issue.path.join('.') : 'scope';
      throw new UsageError(`invalid agreed scope at ${field}`, 'fix the JSON and run gm scope done again');
    }
    const expected = join(root, '.gm', 'scope', `${parsed.data.session_id}.json`);
    if (path !== resolve(expected) || basename(path) !== `${parsed.data.session_id}.json`) {
      throw new UsageError(
        `scope file must be .gm/scope/${parsed.data.session_id}.json`,
        `move it to .gm/scope/${parsed.data.session_id}.json`,
      );
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof UsageError) throw error;
    throw new UsageError(`cannot read scope file ${requested}`, 'check the path and JSON');
  } finally {
    if (handle !== undefined) closeSync(handle);
  }
}

export const command: GmCommand = {
  name: 'scope done',
  summary: 'submit the agreed scope for this scope session',
  usage: '--file .gm/scope/<session-id>.json [--job <id>]',
  example: 'scope done --file .gm/scope/s_123.json',
  flags: {
    file: { type: 'string', help: 'agreed scope JSON inside .gm/scope/' },
    job: { type: 'string', help: 'scope job id (defaults to GM_JOB, then .gm/context/job.json)' },
  },
  async run(ctx, _args, flags) {
    const file = stringFlag(flags, 'file');
    if (!file) throw new UsageError('--file is required', 'gm scope done --file .gm/scope/<session-id>.json');
    const { root, jobId } = jobContext({
      cwd: ctx.cwd,
      job: stringFlag(flags, 'job'),
      environmentJob: ctx.config.jobId,
    });
    const scope = readScope(root, file);
    const line = AgentOutboxLine.parse({
      v: 1,
      id: ulid(),
      job_id: jobId,
      at: new Date().toISOString(),
      type: 'scope.agreed',
      payload: scope,
    });
    appendOutboxLine(root, 'scope.jsonl', line);
    ctx.emit('scope.agreed', { session_id: scope.session_id }, jobId);
    ctx.out(scope.session_id);
    return EXIT.ok;
  },
};
