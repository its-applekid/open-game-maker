import { execFile } from 'node:child_process';

import { BoundaryVerdict, type BoundaryVerdict as BoundaryVerdictType } from '@ogm/contracts';

export type RightsReason = BoundaryVerdictType['reasons'][number];

export class RightsCheckUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RightsCheckUnavailable';
  }
}

export type RightsRunner = (input: {
  cwd: string;
  args: string[];
}) => Promise<{ code: number; stdout: string; stderr: string }>;

const runGm: RightsRunner = ({ cwd, args }) =>
  new Promise((resolve, reject) => {
    execFile('gm', args, { cwd, timeout: 30_000, maxBuffer: 1_048_576 }, (error, stdout, stderr) => {
      if (!error) resolve({ code: 0, stdout, stderr });
      else if (typeof error.code === 'number') resolve({ code: error.code, stdout, stderr });
      else reject(new RightsCheckUnavailable(stderr.trim() || error.message));
    });
  });

export async function checkPublishRights(
  artifactPath: string,
  visibility: 'public' | 'private',
  run: RightsRunner = runGm,
): Promise<RightsReason[]> {
  const result = await run({
    cwd: artifactPath,
    args: ['check', 'assets', '--publish', '--repo-visibility', visibility, '--json'],
  });
  if (result.code === 0) return [];
  if (result.code === 1) {
    try {
      return BoundaryVerdict.parse(JSON.parse(result.stdout) as unknown).reasons;
    } catch (error) {
      throw new RightsCheckUnavailable(`invalid gm rights result: ${(error as Error).message}`);
    }
  }
  throw new RightsCheckUnavailable(result.stderr.trim() || `gm check assets exited ${result.code}`);
}
