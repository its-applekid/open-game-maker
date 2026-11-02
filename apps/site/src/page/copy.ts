function fallbackCopy(text: string, doc: Document): boolean {
  const area = doc.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  doc.body.append(area);
  area.select();
  try {
    return doc.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

export async function copyText(text: string, doc: Document = document): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return fallbackCopy(text, doc);
  }
}

export function initCopy(root: ParentNode, doc: Document = document): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>('button.copy')) {
    button.addEventListener('click', async () => {
      const source = button.parentElement?.querySelector('pre');
      if (!source) return;
      if (await copyText(source.textContent ?? '', doc)) {
        button.dataset.copied = '';
        setTimeout(() => delete button.dataset.copied, 1200);
      }
    });
  }
}
