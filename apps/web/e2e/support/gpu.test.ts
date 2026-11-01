import { afterEach, describe, expect, it, vi } from 'vitest';

import { launchArgs } from './gpu';

describe('Chromium renderer flags', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses EGL and the GPU by default', () => {
    vi.stubEnv('GM_VERIFY_SOFTWARE_GL', '');

    expect(launchArgs()).toEqual(['--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist']);
  });

  it('uses SwiftShader for the CI fallback', () => {
    vi.stubEnv('GM_VERIFY_SOFTWARE_GL', '1');

    expect(launchArgs()).toEqual(['--use-angle=swiftshader']);
  });
});
