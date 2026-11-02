import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadSetupContent, parseSetupContent } from '../src/schema.js';

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const setupPath = fileURLToPath(new URL('../content/setup.yaml', import.meta.url));

describe('setup content', () => {
  it('loads the committed setup content and resolves every citation', () => {
    const content = loadSetupContent(setupPath, repositoryRoot);

    expect(content.steps.map(({ id, title, substeps }) => [id, title, substeps.length])).toEqual([
      [1, 'Host an instance', 4],
      [2, 'Install dependencies', 8],
      [3, 'Set up aiur for agent orchestration', 6],
      [4, 'Set up the games private repo', 4],
      [5, 'Find assets', 4],
      [6, 'Local asset pipeline, optional Google Drive drop', 3],
      [7, 'Configure', 8],
      [8, 'Verify', 4],
    ]);
  });

  it('rejects YAML that breaks the schema', () => {
    expect(() => parseSetupContent('steps:\n  - id: not-a-number\n', repositoryRoot)).toThrow();
  });

  it('rejects citations that do not exist in the checkout', () => {
    const source = `
steps:
  - id: 1
    title: Example
    time: 1 min
    outcome: Done
    preconditions: None
    agent_prompt: Do step {{N}}, {{title}}. {{hand_list}}
    substeps:
      - kind: run
        text: Example
        command: echo ok
        writes: []
        check: echo ok
        cites: [does/not/exist]
`;

    expect(() => parseSetupContent(source, repositoryRoot)).toThrow(/does\/not\/exist/);
  });
});
