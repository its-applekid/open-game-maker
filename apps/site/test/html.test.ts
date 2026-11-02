import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { renderSetupHtml } from '../src/render/html.js';
import { loadSetupContent } from '../src/schema.js';

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const fixture = loadSetupContent(fileURLToPath(new URL('fixtures/setup.yaml', import.meta.url)), repositoryRoot);
const realContent = loadSetupContent(fileURLToPath(new URL('../content/setup.yaml', import.meta.url)), repositoryRoot);

function parse(html: string): Document {
  return new JSDOM(html).window.document;
}

describe('/setup HTML renderer', () => {
  it('renders one accordion header per step whose aria-controls targets a hidden panel', () => {
    const doc = parse(renderSetupHtml(fixture));
    const headers = [...doc.querySelectorAll<HTMLButtonElement>('h2 > button[aria-expanded="false"][aria-controls]')];

    expect(headers.map((button) => button.querySelector('.title')?.textContent)).toEqual(['First step', 'Second step']);
    for (const button of headers) {
      const panel = doc.getElementById(button.getAttribute('aria-controls') ?? '');
      expect(panel?.hidden).toBe(true);
      expect(panel?.getAttribute('aria-labelledby')).toBe(button.id);
    }
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
  });

  it('gives every sub-step a copy button, a labelled checkbox, a Check line and its kind marks', () => {
    const doc = parse(renderSetupHtml(fixture));
    const substeps = [...doc.querySelectorAll<HTMLElement>('li.substep')];

    expect(substeps.map((item) => item.dataset.substep)).toEqual(['1.1', '1.2', '2.1']);
    for (const item of substeps) {
      expect(item.querySelector('button.copy')?.getAttribute('aria-label')).toBe('Copy');
      const box = item.querySelector<HTMLInputElement>('input[type="checkbox"]');
      expect(doc.getElementById(box?.getAttribute('aria-labelledby') ?? '')?.textContent).toBeTruthy();
      expect(item.querySelector('.check')?.textContent).toMatch(/^Check: /);
    }
    expect(substeps[0].querySelector('pre')?.textContent).toBe('echo <user>@<tailnet-host>');
    expect(substeps[1].querySelector('[aria-label="Hand step"]')).not.toBeNull();
    expect(substeps[0].querySelector('[aria-label="Hand step"]')).toBeNull();
    expect(substeps[2].querySelector('.mark')?.textContent).toBe('optional');
    expect(doc.querySelector('[data-progress="1"]')?.textContent).toBe('0/2');
  });

  it('substitutes the step number, title and hand list into each Ask-an-agent block', () => {
    const doc = parse(renderSetupHtml(fixture));
    const [first, second] = [...doc.querySelectorAll('.agent pre')].map((pre) => pre.textContent);

    expect(first).toBe(
      'Do step 1, First step for <user>.\n\nHand steps in this step: `Sign in to the console as <github-owner>`.',
    );
    expect(second).toBe('Do step 2, Second step for <user>.\n\nHand steps in this step: none.');
    expect([...doc.querySelectorAll('#step-1-panel .hand-list li')].map((li) => li.textContent)).toEqual([
      'Sign in to the console as <github-owner>.',
    ]);
    expect(doc.querySelector('#step-2-panel .hand-list')).toBeNull();
  });

  it('renders the eight setup steps with hand lists equal to their hand sub-steps', () => {
    const doc = parse(renderSetupHtml(realContent));
    const panels = [...doc.querySelectorAll<HTMLElement>('.panel')];

    expect(panels).toHaveLength(8);
    expect([...doc.querySelectorAll('h2 .title')].map((title) => title.textContent)).toEqual(
      realContent.steps.map((step) => step.title),
    );
    for (const panel of panels) {
      expect(panel.querySelectorAll('.agent')).toHaveLength(1);
      const handTexts = [...panel.querySelectorAll('li.substep[data-kind="hand"] .say span')].map(
        (span) => span.textContent,
      );
      const listed = [...panel.querySelectorAll('.hand-list li')].map((li) => li.textContent);
      expect(listed).toEqual(handTexts);
      const prompt = panel.querySelector('.agent pre')?.textContent ?? '';
      for (const text of handTexts) expect(prompt).toContain(text?.replace(/\.$/, ''));
    }
    expect(doc.documentElement.outerHTML).not.toMatch(/\.tail[0-9a-f]+\.ts\.net|\/home\/[a-z]/);
  });
});
