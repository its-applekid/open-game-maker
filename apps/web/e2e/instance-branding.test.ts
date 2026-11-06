// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { readInstanceLogoUrl } from '../tools/instance-branding.mjs';

async function envDir(contents: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'ogm-web-branding-'));
  await writeFile(join(directory, 'web.env'), contents);
  return directory;
}

describe('instance branding build input', () => {
  it('uses the default for a blank setting and accepts supported path and URL sources', async () => {
    expect(readInstanceLogoUrl(await envDir('VITE_INSTANCE_LOGO_URL=\n'))).toBe('');
    expect(readInstanceLogoUrl(await envDir('VITE_INSTANCE_LOGO_URL=/branding/logo.webp\n'))).toBe(
      '/branding/logo.webp',
    );
    expect(readInstanceLogoUrl(await envDir('VITE_INSTANCE_LOGO_URL="https://cdn.example.test/logo.svg?v=2"\n'))).toBe(
      'https://cdn.example.test/logo.svg?v=2',
    );
  });

  it.each(['logo.png', '/branding/logo.jpg', 'http://cdn.example.test/logo.png', 'javascript:logo.svg'])(
    'rejects an unsafe or unsupported source: %s',
    async (source) => {
      const directory = await envDir(`VITE_INSTANCE_LOGO_URL=${source}\n`);
      expect(() => readInstanceLogoUrl(directory)).toThrow(/VITE_INSTANCE_LOGO_URL/);
    },
  );

  it('prints only the validated value for deploy.sh', async () => {
    const tool = fileURLToPath(new URL('../tools/instance-branding.mjs', import.meta.url));
    const directory = await envDir('OTHER=do-not-print\nVITE_INSTANCE_LOGO_URL=/branding/logo.png\n');
    const result = spawnSync(process.execPath, [tool], {
      encoding: 'utf8',
      env: { OGM_ENV_DIR: directory },
    });

    expect([result.status, result.stdout, result.stderr]).toEqual([0, '/branding/logo.png\n', '']);
  });

  it('passes the validated value to the Vite build', () => {
    const deploy = fileURLToPath(new URL('../tools/deploy.sh', import.meta.url));

    expect(readFileSync(deploy, 'utf8')).toContain('VITE_INSTANCE_LOGO_URL="$INSTANCE_LOGO_URL"');
  });
});
