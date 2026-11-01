import { normalizeCommitPath } from './paths.js';
import type { Visibility } from './types.js';

export type TemplateFile = { path: string; content: string };
export type TemplateLabel = { name: string; color: string; description?: string };
export type RenderedTemplate = {
  files: TemplateFile[];
  labels: TemplateLabel[];
  requiredChecks: string[];
};

export interface TemplateSource {
  render(
    templateRef: string,
    context: { gameId: string; owner: string; visibility: Visibility },
  ): Promise<RenderedTemplate>;
}

const agentStates = [
  'todo',
  'in-progress',
  'ci-wait',
  'human-review',
  'rework',
  'merging',
  'done',
  'error',
  'cancelled',
  'canceled',
  'budget-exhausted',
];

const agentReasons = [
  'merge-queued',
  'ci-red',
  'body-fix',
  'paused-usage-limit',
  'paused-decision',
  'paused-agent',
  'retrying',
  'blocked',
  'handed-off',
];

const labels: TemplateLabel[] = [
  ...agentStates.map((state) => ({ name: `agent:${state}`, color: '6f42c1' })),
  ...agentReasons.map((reason) => ({ name: `agent:${reason}`, color: '6f42c1' })),
  { name: 'agent:watch', color: '6f42c1' },
  { name: 'agent:paused', color: '6f42c1' },
  ...[1, 2, 3, 4, 5].map((level) => ({ name: `complexity:${level}`, color: '1d76db' })),
  { name: 'flake', color: 'fbca04' },
];

export class DefaultTemplateSource implements TemplateSource {
  async render(
    templateRef: string,
    context: { gameId: string; owner: string; visibility: Visibility },
  ): Promise<RenderedTemplate> {
    if (templateRef !== 'default') throw new Error('unknown template ref');
    return {
      files: [
        { path: 'README.md', content: `# ${context.gameId}\n` },
        { path: '.gitignore', content: '.gm/\nsaves/\n' },
        {
          path: '.github/workflows/ci.yml',
          content:
            'name: ci\non: [push, pull_request]\njobs:\n  required:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n',
        },
      ].map((file) => ({ ...file, path: normalizeCommitPath(file.path) })),
      labels,
      requiredChecks: ['ci / required', 'ogm/boundary'],
    };
  }
}
