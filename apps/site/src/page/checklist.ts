import { readValue, writeValue } from './storage.js';

export function initChecklist(root: ParentNode): void {
  const boxes = [...root.querySelectorAll<HTMLInputElement>('input.done[data-substep]')];

  const count = () => {
    for (const progress of root.querySelectorAll<HTMLElement>('[data-progress]')) {
      const step = progress.dataset.progress;
      const own = boxes.filter((box) => box.dataset.substep?.split('.')[0] === step);
      progress.textContent = `${own.filter((box) => box.checked).length}/${own.length}`;
    }
  };

  for (const box of boxes) {
    const key = `substep:${box.dataset.substep}`;
    box.checked = readValue(key) === '1';
    box.addEventListener('change', () => {
      writeValue(key, box.checked ? '1' : null);
      count();
    });
  }
  count();
}
