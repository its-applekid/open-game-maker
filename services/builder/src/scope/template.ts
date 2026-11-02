import { createHash } from 'node:crypto';

import type { ScopeChoices } from '@ogm/contracts';

export type ScopeTicketInput = { jobId: string; sessionId: string; choices: ScopeChoices };

export function renderScopeTicket(input: ScopeTicketInput): {
  title: string;
  body: string;
  sig: string;
  labels: string[];
} {
  const title = `Scope: ${plain(input.choices.genre)} ${plain(input.choices.vibe)} game`.slice(0, 80);
  const choices = [
    `- Genre: ${plain(input.choices.genre)}`,
    `- Vibe: ${plain(input.choices.vibe)}`,
    `- Family: ${plain(input.choices.family)}`,
    `- World: ${plain(input.choices.world)}`,
    `- Players: ${input.choices.players}`,
    `- Point of view: ${plain(input.choices.pov)}`,
    ...(input.choices.other === undefined ? [] : [`- Other: ${plain(input.choices.other)}`]),
  ].join('\n');
  const file = `.gm/scope/${input.sessionId}.json`;
  const unsigned = [
    `Talk through a small game scope using these creation choices:\n\n${choices}`,
    '## Scope\n\nUse the build chat to ask at most five questions, propose 2-3 right-sized scopes from the pack catalog, and agree one with the creator.',
    `## Acceptance\n\n- \`${file}\` written with \`gm scope done\` and committed in this pull request\n- Run \`gm scope done --file ${file}\` after writing it\n- The agreed scope contains build tickets and does not implement game code`,
    '## Load skills\n- gm-scope-options',
  ].join('\n\n');
  const sig = createHash('sha256').update(unsigned).digest('hex');
  return {
    title,
    body: `${unsigned}\n\n<!-- gm-job:${input.jobId} gm-ticket:scope gm-sig:${sig} gm-scope:${input.sessionId} -->`,
    sig,
    labels: ['complexity:1', `feature:gm-${input.jobId}`, 'agent:todo'],
  };
}

function plain(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
