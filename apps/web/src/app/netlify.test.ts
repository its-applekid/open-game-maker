import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { renderRedirects } from '../../tools/redirects.mjs';

const publicFile = (name: string) => readFileSync(resolve(process.cwd(), 'public', name), 'utf8');

describe('Netlify static configuration', () => {
  it('places both backend proxies, built from the deploy-time origin, before the SPA fallback', () => {
    expect(renderRedirects('https://box.tail0000.ts.net:8443').split('\n').filter(Boolean)).toEqual([
      '/api/*  https://box.tail0000.ts.net:8443/api/:splat  200',
      '/auth/*  https://box.tail0000.ts.net:8443/auth/:splat  200',
      '/*  /index.html  200',
    ]);
  });

  // The host is a deploy-time value (#317): the repo keeps no _redirects of its own.
  it('writes _redirects only into the deploy payload', () => {
    const deploy = readFileSync(resolve(process.cwd(), 'tools/deploy.sh'), 'utf8');

    expect(existsSync(resolve(process.cwd(), 'public/_redirects'))).toBe(false);
    expect(deploy).toContain('REDIRECTS="$(node "$ROOT/apps/web/tools/redirects.mjs")"');
    expect(deploy).toContain('>"$DEPLOY_DIR/_redirects"');
  });

  it('pins cache policy for the worker, town, and built assets', () => {
    const headers = publicFile('_headers');

    expect(headers).toContain('/sw.js\n  Cache-Control: no-cache');
    expect(headers).toContain('/town/*\n  Cache-Control: no-cache');
    expect(headers).toContain('/assets/*\n  Cache-Control: public, max-age=31536000, immutable');
  });

  it('keeps load evidence outside the temporary deploy payload', () => {
    const deploy = readFileSync(resolve(process.cwd(), 'tools/deploy.sh'), 'utf8');

    expect(deploy).toContain('RECORD_DIR="$(mktemp -d)"');
    expect(deploy).not.toContain('RECORD_DIR="$DEPLOY_DIR');
    expect(deploy).not.toContain('>"$DEPLOY_DIR/preview.log"');
  });
});
