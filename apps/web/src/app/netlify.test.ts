import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const publicFile = (name: string) => readFileSync(resolve(process.cwd(), 'public', name), 'utf8');

describe('Netlify static configuration', () => {
  it('places both backend proxies before the SPA fallback', () => {
    const lines = publicFile('_redirects')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    expect(lines).toEqual([
      '/api/*  https://applekid.tailee0e71.ts.net:8443/api/:splat  200',
      '/auth/*  https://applekid.tailee0e71.ts.net:8443/auth/:splat  200',
      '/*  /index.html  200',
    ]);
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
