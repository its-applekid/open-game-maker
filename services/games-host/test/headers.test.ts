import { describe, expect, it } from 'vitest';

import { gameHeaders, healthHeaders } from '../src/headers.js';
import { mimeForPath } from '../src/mime.js';

describe('games-host response headers', () => {
  it('returns the complete immutable game security policy', () => {
    const headers = gameHeaders('https://ogm2000.netlify.app');

    expect(Object.keys(headers).sort()).toEqual(
      [
        'Cache-Control',
        'Content-Security-Policy',
        'Cross-Origin-Opener-Policy',
        'Cross-Origin-Resource-Policy',
        'Permissions-Policy',
        'Referrer-Policy',
        'X-Content-Type-Options',
      ].sort(),
    );
    expect(headers['Content-Security-Policy']).toContain("default-src 'none'");
    expect(headers['Content-Security-Policy']).toContain('frame-ancestors https://ogm2000.netlify.app');
    expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(headers['Cross-Origin-Resource-Policy']).toBe('cross-origin');
    expect(headers['Permissions-Policy']).toBe('microphone=(self), camera=(), geolocation=(), payment=()');
    expect(headers['Cache-Control']).toBe('public, max-age=31536000, immutable');
  });

  it('prevents health responses from being cached', () => {
    expect(healthHeaders()).toEqual({
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    });
  });

  it('rejects CSP directive injection through the frame ancestor setting', () => {
    expect(() => gameHeaders('https://example.test; script-src *')).toThrow(
      'app origin must contain only CSP origin sources',
    );
  });
});

describe('games-host MIME types', () => {
  it.each([
    ['index.html', 'text/html; charset=utf-8'],
    ['game.js', 'text/javascript; charset=utf-8'],
    ['module.mjs', 'text/javascript; charset=utf-8'],
    ['styles.css', 'text/css; charset=utf-8'],
    ['module.wasm', 'application/wasm'],
    ['manifest.json', 'application/json; charset=utf-8'],
    ['model.glb', 'model/gltf-binary'],
    ['texture.ktx2', 'image/ktx2'],
    ['image.webp', 'image/webp'],
    ['image.png', 'image/png'],
    ['music.mp3', 'audio/mpeg'],
    ['bundle.js.map', 'application/json; charset=utf-8'],
  ])('maps %s to %s', (path, expected) => {
    expect(mimeForPath(path)).toBe(expected);
  });

  it('uses an inert default for unknown extensions', () => {
    expect(mimeForPath('payload.exe')).toBe('application/octet-stream');
  });
});
