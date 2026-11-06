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

// Lifecycle states aiur's `StatePolicy` recognises, as bare suffixes (no prefix).
export const STATE_SUFFIXES: readonly string[] = STATES.map(([state]) => state);

// Every label aiur itself applies under a daemon prefix: the lifecycle states above plus the reason labels and the
// watch/pause switches. A prefix-blind check must not assume `agent:` — a game daemon's prefix is its game slug.
export const DAEMON_LABEL_SUFFIXES: readonly string[] = [
  ...STATE_SUFFIXES,
  ...REASONS.map(([reason]) => reason),
  'watch',
  'paused',
];

// The whole-repo label set: a daemon whose label prefix is the default `agent`.
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

/**
 * Whether a label aiur itself applies is written under any daemon prefix, e.g. `agent:todo`, `castle-run:ci-wait` or
 * `castle-run:blocked`. A game daemon's labels carry its game slug, so prefix-blind checks must not assume `agent:`.
 */
export function isDaemonLabel(label: string): boolean {
  const separator = label.indexOf(':');
  if (separator <= 0) return false;
  // The suffix normalises the way projections read a label (`Agent: Human Review` reads `human-review`).
  const suffix = label
    .slice(separator + 1)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
  return DAEMON_LABEL_SUFFIXES.includes(suffix);
}
