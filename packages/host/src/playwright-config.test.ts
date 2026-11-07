import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * The harness loads game-3d as a test build (test/app/main.ts), so its webServer must build the
 * template in vite's test mode. A default `vite build` is a draft build, so the mode flag is what
 * keeps the served bundle matching the build kind the frame declares. The config is read as text
 * because importing it would pull a package-root file into this package's `rootDir: src` build.
 */
describe('the host browser harness builds game-3d as an explicit test build', () => {
  it('the webServer asks vite for the test mode', () => {
    const config = readFileSync(join(process.cwd(), 'playwright.config.ts'), 'utf8');
    expect(config.replace(/\s+/g, ' ')).toContain('@gm/template-game-3d exec vite build --mode test');
  });
});
