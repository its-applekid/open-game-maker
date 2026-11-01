import { execFile } from 'node:child_process';

import { BoundaryVerdict, type BoundaryVerdict as BoundaryVerdictType } from '@ogm/contracts';

export type RightsReason = BoundaryVerdictType['reasons'][number];

export class RightsCheckUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RightsCheckUnavailable';
  }
}

export function checkPublishRights(
  artifactPath: string,
  visibility: 'public' | 'private',
): Promise<RightsReason[]> {
  return new Promise((resolve, reject) => {
    execFile(
      'gm',
      ['check', 'assets', '--publish', '--repo-visibility', visibility, '--json'],
      { cwd: artifactPath, timeout: 30_000, maxBuffer: 1_048_576 },
      (error, stdout, stderr) => {
        if (!error) {
          resolve([]);
          return;
        }
        if (error.code === 1) {
          try {
            resolve(BoundaryVerdict.parse(JSON.parse(stdout) as unknown).reasons);
          } catch (parseError) {
            reject(new RightsCheckUnavailable(`invalid gm rights result: ${(parseError as Error).message}`));
          }
          return;
        }
        reject(new RightsCheckUnavailable(stderr.trim() || error.message));
      },
    );
  });
}
