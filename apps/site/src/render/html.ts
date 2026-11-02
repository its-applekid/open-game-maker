import type { SplashContent } from '../splash.js';

const FONTS =
  'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&amp;family=Nunito:wght@600;700;800&amp;display=swap';

const GITHUB_ICON =
  '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"/></svg>';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderPage({ title, body }: { title: string; body: string }): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
    <meta name="theme-color" content="#a69b8d" />
    <title>${escapeHtml(title)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="${FONTS}" rel="stylesheet" />
    <link rel="stylesheet" href="/tokens.css" />
    <link rel="stylesheet" href="/site.css" />
  </head>
  <body>
${body}
  </body>
</html>
`;
}

export function renderSplashHtml(content: SplashContent): string {
  const e = escapeHtml;
  const features = content.captures
    .map(
      (capture) => `      <section class="s-feature">
        <h2>${e(capture.heading)}</h2>
        <video src="${e(capture.path)}" poster="${e(capture.poster)}" muted loop playsinline autoplay preload="none"></video>
      </section>`,
    )
    .join('\n');

  const body = `    <main>
      <section class="s-hero">
        <picture class="s-poster">
          <source media="(orientation: portrait)" srcset="/hero/poster-portrait.webp" />
          <img alt="" src="/hero/poster-landscape.webp" fetchpriority="high" />
        </picture>
        <h1 class="s-logo"><img src="/hero/logo.webp" alt="Open Game Maker 2000" width="1400" height="788" /></h1>
        <div class="s-menu">
          <p class="s-line">${e(content.line)}</p>
          <a class="s-cta" href="/setup">${e(content.cta.setup)}</a>
          <a class="s-cta" href="${e(content.app_origin)}">${e(content.cta.sign_in)}</a>
        </div>
      </section>
${features}
    </main>
    <footer class="s-footer">
      <a href="${e(content.footer.repo)}" aria-label="Source on GitHub">${GITHUB_ICON}</a>
      <small>${e(content.footer.licence)}</small>
    </footer>`;

  return renderPage({ title: 'Open Game Maker 2000', body });
}
