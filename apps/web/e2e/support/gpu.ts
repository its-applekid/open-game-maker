export function launchArgs(): string[] {
  // This CI-only renderer switch is part of the browser harness contract.
  // eslint-disable-next-line no-restricted-properties
  if (process.env.GM_VERIFY_SOFTWARE_GL === '1') {
    return ['--use-angle=swiftshader'];
  }

  return ['--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'];
}
