import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { run } from '../src/bin/validate-cards.js';
import { checkDocuments } from '../src/validate.js';
import { cardFixtureDocs, negativeFixture } from './helpers.js';

const expectedFailure = {
  'derive-audio-without-basis.json': 'rights=basis',
  'interpretation-adds-forbidden-use.json': 'rights=basis',
  'interpretation-not-admin.json': 'schema',
  'model-writes-audio-key.json': 'model-writes-allowlist',
  'processing-any-on-vendor-license.json': 'processing-rule',
} as const;

function render(check: { file: string; check: string; ok: boolean; message?: string }): string {
  return `${check.ok ? 'ok  ' : 'FAIL'} ${check.check}  ${check.file}${check.ok ? '' : `  ${check.message ?? ''}`}`;
}

describe('document checks', () => {
  it('preserves every legacy check line and adds processing checks', () => {
    const result = checkDocuments(cardFixtureDocs());
    expect(result.ok).toBe(true);

    const legacyLines = result.results
      .filter(({ check }) => check !== 'processing-rule')
      .map(render)
      .join('\n');
    const snapshot = readFileSync(new URL('__snapshots__/validate-mjs.txt', import.meta.url), 'utf8').trimEnd();
    expect(legacyLines).toBe(snapshot);
  });

  for (const [file, check] of Object.entries(expectedFailure)) {
    it(`${file} fails only ${check}`, () => {
      const result = checkDocuments([...cardFixtureDocs(), negativeFixture(file)]);
      const failures = result.results.filter(({ ok }) => !ok);
      expect(failures.map((failure) => failure.check)).toEqual([check]);
      if (file === 'interpretation-adds-forbidden-use.json') {
        expect(failures[0]?.message).toContain('forbidden use');
      }
    });
  }

  it('returns CLI-compatible FAIL lines and exit code 1', () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exit = run(['fixtures/cards-negative/model-writes-audio-key.json'], {
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    });
    expect(exit).toBe(1);
    expect(stdout.some((line) => line.startsWith('FAIL model-writes-allowlist'))).toBe(true);
    expect(stderr).toEqual([]);
  });

  it('stops after schema failure for an incomplete card', () => {
    const result = checkDocuments([{ file: 'broken.json', doc: { schema: 'ogm.asset-card/1.1' } }]);

    expect(result.ok).toBe(false);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({ file: 'broken.json', check: 'schema', ok: false });
  });
});
