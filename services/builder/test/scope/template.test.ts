import { readFileSync } from 'node:fs';

import type { ScopeChoices } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

import { renderScopeTicket } from '../../src/scope/template.js';

const choices = JSON.parse(
  readFileSync(new URL('../../../../packages/contracts/fixtures/scope/choices.json', import.meta.url), 'utf8'),
) as ScopeChoices;

describe('scope ticket template', () => {
  it('renders the scope marker, skill, acceptance, and final label set', () => {
    const issue = renderScopeTicket({
      jobId: 'j_88000000-0000-4000-8000-000000000001',
      sessionId: 's_88000000-0000-4000-8000-000000000001',
      choices,
      labelPrefix: 'castle-run',
    });

    expect(issue.title).toBe('Scope: platformer cozy game');
    expect(issue.title.length).toBeLessThanOrEqual(80);
    expect(issue.body).toContain('gm-job:j_88000000-0000-4000-8000-000000000001');
    expect(issue.body).toContain('gm-ticket:scope');
    expect(issue.body).toContain('- Audio direction: chiptune, playful');
    expect(issue.body).toContain('gm-scope:s_88000000-0000-4000-8000-000000000001');
    expect(issue.body).toContain('## Load skills\n- gm-scope-options');
    expect(issue.body).toContain('ask at most five questions');
    expect(issue.body).toContain('propose 2-3 right-sized scopes from the pack catalog');
    expect(issue.body).toContain(
      '`.gm/scope/s_88000000-0000-4000-8000-000000000001.json` written with `gm scope done`',
    );
    expect(issue.labels).toEqual([
      'complexity:1',
      'feature:gm-j_88000000-0000-4000-8000-000000000001',
      'castle-run:todo',
    ]);
  });
});
