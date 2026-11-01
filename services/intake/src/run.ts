import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type ImportResult = {
  collection: string;
  status: 'imported' | 'awaiting-license';
  license: string | null;
  rights?: unknown;
  confirmed_by?: string | null;
};

export type ImportInvocation = {
  gmBin: string;
  nice: ['-n', '10'];
  args: string[];
  id: string;
  dropId: string;
};

export type ImportRunner = (invocation: ImportInvocation) => Promise<ImportResult>;

export const runImport: ImportRunner = async (invocation) => {
  const { stdout } = await execFileAsync('nice', [...invocation.nice, invocation.gmBin, ...invocation.args], {
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
  const line = stdout.split(/\r?\n/).filter(Boolean).at(-1);
  if (!line) throw new Error('gm returned no JSON result');
  const result = JSON.parse(line) as ImportResult;
  if (!result.collection || !['imported', 'awaiting-license'].includes(result.status)) {
    throw new Error('gm returned an invalid import result');
  }
  return result;
};
