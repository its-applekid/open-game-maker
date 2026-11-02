import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderAgentPrompt, renderSetupMarkdown } from '../src/render/markdown.js';
import { loadSetupContent } from '../src/schema.js';

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const setupPath = fileURLToPath(new URL('../content/setup.yaml', import.meta.url));

describe('SETUP.md renderer', () => {
  it('renders eight numbered steps and matching hand-step prompts', () => {
    const content = loadSetupContent(setupPath, repositoryRoot);
    const markdown = renderSetupMarkdown(content);

    expect(markdown.match(/^## \d+\./gm)).toHaveLength(8);
    expect(markdown).not.toMatch(/\.tail[0-9a-f]+\.ts\.net|\/home\/[a-z]/);

    for (const step of content.steps) {
      expect(markdown).toContain(`## ${step.id}. ${step.title}`);
      expect(markdown).toContain(`Outcome: ${step.outcome}`);
      expect(markdown).toContain(`Time: ${step.time}`);
      expect(markdown).toContain(`Preconditions: ${step.preconditions}`);

      const handSteps = step.substeps.filter((substep) => substep.kind === 'hand');
      const agentPrompt = renderAgentPrompt(step);
      for (const handStep of handSteps) {
        expect(agentPrompt).toContain(handStep.text.replace(/\.$/, ''));
      }
    }
  });
});
