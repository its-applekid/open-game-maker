import { describe, expect, it, vi } from 'vitest';

import { checkPublishRights, RightsCheckUnavailable, type RightsRunner } from '../src/releases/rights.js';

describe('publish rights check', () => {
  it('runs the documented gm command in the artifact directory', async () => {
    const run = vi.fn<RightsRunner>(async () => ({ code: 0, stdout: '', stderr: '' }));

    await expect(checkPublishRights('/artifacts/build', 'public', run)).resolves.toEqual([]);
    expect(run).toHaveBeenCalledWith({
      cwd: '/artifacts/build',
      args: ['check', 'assets', '--publish', '--repo-visibility', 'public', '--json'],
    });
  });

  it('maps an exit-one verdict to rights reasons', async () => {
    const run: RightsRunner = async () => ({
      code: 1,
      stdout: JSON.stringify({ allowed: false, reasons: [{ code: 'rights', detail: 'not redistributable' }] }),
      stderr: '',
    });

    await expect(checkPublishRights('/artifacts/build', 'private', run)).resolves.toEqual([
      { code: 'rights', detail: 'not redistributable' },
    ]);
  });

  it.each([
    [{ code: 1, stdout: 'not-json', stderr: '' }, /invalid gm rights result/],
    [{ code: 2, stdout: '', stderr: 'gm failed' }, /gm failed/],
  ] as const)('rejects unusable checker output', async (result, message) => {
    await expect(checkPublishRights('/artifacts/build', 'public', async () => result)).rejects.toThrow(message);
    await expect(checkPublishRights('/artifacts/build', 'public', async () => result)).rejects.toBeInstanceOf(
      RightsCheckUnavailable,
    );
  });
});
