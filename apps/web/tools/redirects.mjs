// Netlify _redirects for the deploy payload: API and auth proxies to the host's public origin, then the SPA fallback.
// The origin comes from VITE_API_ORIGIN at deploy time so the repo never names the host.
import { pathToFileURL } from 'node:url';

export function renderRedirects(apiOrigin) {
  const origin = globalThis.URL.canParse(apiOrigin) ? new globalThis.URL(apiOrigin).origin : 'null';
  if (!origin.startsWith('https://') || origin !== apiOrigin.replace(/\/$/, '')) {
    throw new Error(`VITE_API_ORIGIN must be an https origin like https://<tailnet-host>:8443, got "${apiOrigin}"`);
  }
  return [`/api/*  ${origin}/api/:splat  200`, `/auth/*  ${origin}/auth/:splat  200`, '/*  /index.html  200', ''].join(
    '\n',
  );
}

if (globalThis.process.argv[1] && import.meta.url === pathToFileURL(globalThis.process.argv[1]).href) {
  try {
    globalThis.process.stdout.write(renderRedirects(globalThis.process.argv[2] ?? ''));
  } catch (error) {
    globalThis.process.stderr.write(`${error.message}\n`);
    globalThis.process.exit(1);
  }
}
