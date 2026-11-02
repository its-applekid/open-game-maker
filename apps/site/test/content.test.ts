import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { renderAgentPrompt } from '../src/render/markdown.js';
import { SetupContentSchema, type SetupContent } from '../src/schema.js';

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const setupPath = fileURLToPath(new URL('../content/setup.yaml', import.meta.url));
const source = readFileSync(setupPath, 'utf8');
/* the schema alone, without loadSetupContent's citation check, so each rule below is asserted by this file */
const content: SetupContent = SetupContentSchema.parse(parse(source));

const repoPathPrefix = /^(?:\.\/)?(?:ops|scripts|services|apps|packages|docs|\.github)\//;

/* tokens in a command that name a repo path; trailing prose punctuation (a comment's full stop) is not part of the path */
function repoPathTokens(command: string): string[] {
  return command
    .split(/[\s"'`=(),;|&<>]+/)
    .map((token) => token.replace(/[.:]+$/, ''))
    .filter((token) => repoPathPrefix.test(token));
}

describe('content/setup.yaml', () => {
  it('parses against the schema', () => {
    expect(() => SetupContentSchema.parse(parse(source))).not.toThrow();
  });

  it('cites only paths that exist from the repository root', () => {
    const missing = content.steps.flatMap((step) =>
      step.substeps.flatMap((substep) => substep.cites.filter((cite) => !existsSync(resolve(repositoryRoot, cite)))),
    );
    expect(missing).toEqual([]);
  });

  it('names only repo paths in commands that exist, or that an earlier required sub-step writes', () => {
    const written: string[] = [];
    const missing: string[] = [];
    for (const step of content.steps) {
      for (const [index, substep] of step.substeps.entries()) {
        for (const token of repoPathTokens(substep.command)) {
          const path = token.replace(/^\.\//, '');
          const created = written.some((write) => path === write || path.startsWith(`${write}/`));
          if (!created && !existsSync(resolve(repositoryRoot, path))) missing.push(`${step.id}.${index + 1} ${path}`);
        }
        if (substep.kind !== 'optional') written.push(...substep.writes);
      }
    }
    expect(missing).toEqual([]);
  });

  it('numbers the eight steps consecutively from 1', () => {
    expect(content.steps.map((step) => step.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("lists every hand sub-step in its step's Ask-an-agent block", () => {
    for (const step of content.steps) {
      const prompt = renderAgentPrompt(step);
      for (const hand of step.substeps.filter((substep) => substep.kind === 'hand')) {
        expect(prompt, `step ${step.id}`).toContain(`\`${hand.text.replace(/\.$/, '')}\``);
      }
    }
  });

  it('names no host of this machine or the hosted app, so a self-hoster can follow it as written', () => {
    expect(source).not.toMatch(/\.tail[0-9a-f]+\.ts\.net|\/home\/[a-z]|ogm2000\.netlify\.app/);
  });
});

describe('repo path tokens', () => {
  it('finds repo paths inside commands and comments and drops trailing punctuation', () => {
    expect(
      repoPathTokens('ops/bin/x.sh --dry-run\n# Write it to apps/web/.id.\ncp "services/a/b" ~/c && make venv'),
    ).toEqual(['ops/bin/x.sh', 'apps/web/.id', 'services/a/b']);
  });
});
