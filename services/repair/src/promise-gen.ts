import type { PromiseArtifact } from '@ogm/contracts';
import type { ReplayBundle } from '@ogm/gm-verify';

export function promiseArtifact(signature: string, bundle: ReplayBundle): PromiseArtifact {
  if (!/^[0-9a-f]{64}$/.test(signature)) throw new TypeError('promise signature must be lowercase hex');
  const error = bundle.errors[0];
  const expectedError = typeof error === 'string' ? error : error?.message;
  const replay = {
    seed: bundle.seed,
    keyframe: bundle.keyframe,
    actions: bundle.actions,
    ...(expectedError ? { expectedError } : {}),
  };
  return {
    specPath: `promises/${signature}.spec.ts`,
    replayPath: `promises/${signature}.replay.json`,
    spec: `import { promiseTest } from '@gm/sdk/test';\nimport replay from './${signature}.replay.json';\npromiseTest(replay);\n`,
    replay: `${JSON.stringify(replay, null, 2)}\n`,
  };
}
