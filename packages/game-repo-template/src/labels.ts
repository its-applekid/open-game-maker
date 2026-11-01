export type TemplateLabel = { name: string; color: string; description: string };

// aiur's required groups and descriptions (aiur `src/lib/aiur/github/labels.ex`); `feature:*` labels are per job (OGM-031).
const STATES: [string, string][] = [
  ['todo', 'ready to be worked'],
  ['in-progress', 'agent is working it'],
  ['ci-wait', 'awaiting CI before human review'],
  ['human-review', 'awaiting human review'],
  ['rework', 'sent back for changes'],
  ['merging', 'merging the PR'],
  ['done', 'completed'],
  ['error', 'agent hit an error'],
  ['cancelled', 'work cancelled'],
  ['canceled', 'work cancelled'],
  ['budget-exhausted', 'ticket spend cap exhausted'],
];

const REASONS: [string, string][] = [
  ['merge-queued', 'approved pull request is waiting in the merge queue'],
  ['ci-red', 'required CI checks failed'],
  ['body-fix', 'pull request body needs a documentation or evidence fix'],
  ['paused-usage-limit', 'paused because the provider usage limit is exhausted'],
  ['paused-decision', 'paused while waiting for an operator decision'],
  ['paused-agent', "paused at the agent's request"],
  ['retrying', 'waiting for the retry back-off'],
  ['blocked', 'blocked by an open dependency'],
  ['handed-off', 'work handed to another Aiur instance'],
];

const AGENT = '6f42c1';

export const LABELS: readonly TemplateLabel[] = [
  ...STATES.map(([state, description]) => ({ name: `agent:${state}`, color: AGENT, description })),
  ...REASONS.map(([reason, description]) => ({ name: `agent:${reason}`, color: AGENT, description })),
  { name: 'agent:watch', color: AGENT, description: 'aiur watches this PR for comments' },
  { name: 'agent:paused', color: AGENT, description: 'suppress aiur work while preserving state' },
  ...[1, 2, 3, 4, 5].map((n) => ({
    name: `complexity:${n}`,
    color: '1d76db',
    description: `story-point complexity ${n}`,
  })),
  { name: 'flake', color: 'fbca04', description: 'known intermittent test failure' },
];
