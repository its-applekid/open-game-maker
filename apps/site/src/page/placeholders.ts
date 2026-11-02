import { readValue, writeValue } from './storage.js';

export function substitute(template: string, values: Record<string, string>): string {
  return template.replace(/<[a-z-]+>/g, (token) => values[token] || token);
}

export function initPlaceholders(root: ParentNode): void {
  const inputs = [...root.querySelectorAll<HTMLInputElement>('input[data-token]')];
  const targets = [...root.querySelectorAll<HTMLElement>('[data-template]')];

  const apply = () => {
    const values = Object.fromEntries(inputs.map((input) => [input.dataset.token ?? '', input.value.trim()]));
    for (const target of targets) target.textContent = substitute(target.dataset.template ?? '', values);
  };

  for (const input of inputs) {
    const token = input.dataset.token ?? '';
    input.value = readValue(`placeholder:${token}`) ?? '';
    input.addEventListener('input', () => {
      writeValue(`placeholder:${token}`, input.value.trim() || null);
      apply();
    });
  }
  apply();
}
