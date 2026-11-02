// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initAccordion } from '../src/page/accordion.js';
import { initChecklist } from '../src/page/checklist.js';
import { copyText, initCopy } from '../src/page/copy.js';
import { initPlaceholders, substitute } from '../src/page/placeholders.js';
import { renderSetupHtml } from '../src/render/html.js';
import type { SetupContent } from '../src/schema.js';
import { parse } from 'yaml';

/* schema.ts resolves its default root with node's URL, which jsdom replaces, so read the fixture directly. */
const fixture = parse(readFileSync(resolve(import.meta.dirname, 'fixtures/setup.yaml'), 'utf8')) as SetupContent;

function mount(): void {
  const doc = new DOMParser().parseFromString(renderSetupHtml(fixture), 'text/html');
  document.body.innerHTML = doc.body.innerHTML;
}

function type(name: string, value: string): void {
  const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

beforeEach(() => {
  localStorage.clear();
  mount();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.location.hash = '';
});

describe('placeholders', () => {
  it('leaves tokens literal when empty and substitutes filled ones', () => {
    expect(substitute('<user>@<tailnet-host> <other>', { '<user>': 'kev', '<tailnet-host>': '' })).toBe(
      'kev@<tailnet-host> <other>',
    );
  });

  it('rewrites commands and prompts, and restores stored values on reload', () => {
    initPlaceholders(document);
    type('user', 'kev');
    type('tailnet-host', 'box.tail1.ts.net');

    expect(document.querySelector('#step-1-panel pre')?.textContent).toBe('echo kev@box.tail1.ts.net');
    expect(document.querySelector('#step-1-panel .agent pre')?.textContent).toContain('for kev.');

    mount();
    initPlaceholders(document);
    expect(document.querySelector<HTMLInputElement>('input[name="user"]')?.value).toBe('kev');
    expect(document.querySelector('#step-1-panel pre')?.textContent).toBe('echo kev@box.tail1.ts.net');
  });
});

describe('checklist', () => {
  it('counts ticked sub-steps per step and keeps them across a reload', () => {
    initChecklist(document);
    const box = document.querySelector<HTMLInputElement>('input.done[data-substep="1.2"]')!;
    box.click();
    expect(document.querySelector('[data-progress="1"]')?.textContent).toBe('1/2');

    mount();
    initChecklist(document);
    expect(document.querySelector<HTMLInputElement>('input.done[data-substep="1.2"]')?.checked).toBe(true);
    expect(document.querySelector('[data-progress="1"]')?.textContent).toBe('1/2');
  });

  it('forgets a sub-step when it is unticked', () => {
    initChecklist(document);
    const box = document.querySelector<HTMLInputElement>('input.done[data-substep="1.1"]')!;
    box.click();
    box.click();

    mount();
    initChecklist(document);
    expect(document.querySelector<HTMLInputElement>('input.done[data-substep="1.1"]')?.checked).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it('works when localStorage throws', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('denied');
    });
    initPlaceholders(document);
    initChecklist(document);
    document.querySelector<HTMLInputElement>('input.done[data-substep="1.1"]')!.click();
    type('user', 'kev');

    expect(document.querySelector('[data-progress="1"]')?.textContent).toBe('1/2');
    expect(document.querySelector('#step-1-panel pre')?.textContent).toBe('echo kev@<tailnet-host>');
  });
});

describe('accordion', () => {
  it('toggles aria-expanded and hidden on activation', () => {
    initAccordion(document);
    const button = document.querySelector<HTMLButtonElement>('#step-1-button')!;
    const panel = document.getElementById('step-1-panel')!;

    button.click();
    expect([button.getAttribute('aria-expanded'), panel.hidden]).toEqual(['true', false]);
    button.click();
    expect([button.getAttribute('aria-expanded'), panel.hidden]).toEqual(['false', true]);
  });

  it('opens the step named in the URL hash', () => {
    window.location.hash = '#step-2';
    initAccordion(document);
    expect(document.getElementById('step-2-panel')?.hidden).toBe(false);
    expect(document.getElementById('step-1-panel')?.hidden).toBe(true);
  });

  it('opens a step when the hash changes after load', () => {
    initAccordion(document);
    window.location.hash = '#step-1';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(document.getElementById('step-1-panel')?.hidden).toBe(false);
  });
});

describe('copy', () => {
  it('copies the substituted command text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    initPlaceholders(document);
    initCopy(document);
    type('user', 'kev');

    document.querySelector<HTMLButtonElement>('#step-1-panel button.copy')!.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('echo kev@<tailnet-host>'));

    const promptButton = document.querySelector<HTMLButtonElement>('#step-1-panel .agent button.copy')!;
    promptButton.click();
    await vi.waitFor(() => expect(promptButton.dataset.copied).toBe(''));
    expect(writeText).toHaveBeenLastCalledWith(document.querySelector('#step-1-panel .agent pre')?.textContent);
    expect(writeText.mock.lastCall?.[0]).toContain('for kev.');
  });

  it('falls back to selecting text when the clipboard API is refused', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });

    await expect(copyText('echo hi')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });
});
