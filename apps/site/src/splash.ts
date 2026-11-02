import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';

const sitePath = z.string().regex(/^\/[\w./-]+$/, 'must be a site path starting with /');

export const SplashContentSchema = z
  .object({
    line: z.string().min(1),
    app_origin: z.url({ protocol: /^https$/ }),
    cta: z.object({ setup: z.string().min(1), sign_in: z.string().min(1) }).strict(),
    captures: z.array(z.object({ heading: z.string().min(1), path: sitePath, poster: sitePath }).strict()).length(3),
    footer: z.object({ repo: z.url({ protocol: /^https$/ }), licence: z.string().min(1) }).strict(),
  })
  .strict();

export type SplashContent = z.infer<typeof SplashContentSchema>;

export function parseSplashContent(source: string): SplashContent {
  return SplashContentSchema.parse(parse(source));
}

export function loadSplashContent(path: string): SplashContent {
  return parseSplashContent(readFileSync(path, 'utf8'));
}
