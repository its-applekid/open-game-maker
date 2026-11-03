import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const worker = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');

describe('service worker shell', () => {
  it('keeps separate deploy and durable asset caches', () => {
    expect(worker).toContain("const BUILD = '__BUILD__'");
    expect(worker).toContain("CACHE = 'ogm-' + BUILD");
    expect(worker).toContain("ASSETS = 'ogm-assets'");
  });

  it('preserves prototype caches while removing stale app caches', () => {
    expect(worker).toContain("key.startsWith('ogm-')");
    expect(worker).toContain("!key.startsWith('ogm-proto-')");
  });

  it('never handles API, auth, or service-worker requests', () => {
    expect(worker).toContain("pathname.startsWith('/api/')");
    expect(worker).toContain("pathname.startsWith('/auth/')");
    expect(worker).toContain("pathname.endsWith('/sw.js')");
  });

  it('keeps background asset refreshes alive until caching finishes', () => {
    expect(worker).toContain('event.waitUntil(network.catch');
  });
});
