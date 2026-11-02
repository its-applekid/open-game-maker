function panelFor(button: HTMLButtonElement): HTMLElement | null {
  return button.ownerDocument.getElementById(button.getAttribute('aria-controls') ?? '');
}

function reducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;
}

export function setOpen(button: HTMLButtonElement, open: boolean, animate = true): void {
  const panel = panelFor(button);
  if (!panel) return;
  button.setAttribute('aria-expanded', String(open));
  const canAnimate = animate && !reducedMotion() && typeof panel.animate === 'function';

  if (open) {
    panel.hidden = false;
    if (canAnimate)
      panel.animate([{ height: '0px' }, { height: `${panel.scrollHeight}px` }], { duration: 220, easing: 'ease-out' });
    return;
  }
  if (!canAnimate) {
    panel.hidden = true;
    return;
  }
  const closing = panel.animate([{ height: `${panel.scrollHeight}px` }, { height: '0px' }], {
    duration: 180,
    easing: 'ease-in',
  });
  closing.onfinish = () => {
    if (button.getAttribute('aria-expanded') === 'false') panel.hidden = true;
  };
}

export function openFromHash(root: ParentNode, hash: string): void {
  const match = /^#step-(\d+)$/.exec(hash);
  if (!match) return;
  const button = root.querySelector<HTMLButtonElement>(`#step-${match[1]} > button[aria-controls]`);
  if (button) setOpen(button, true, false);
}

export function initAccordion(root: ParentNode, win: Window = window): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>('h2 > button[aria-controls]')) {
    button.addEventListener('click', () => setOpen(button, button.getAttribute('aria-expanded') !== 'true'));
  }
  openFromHash(root, win.location.hash);
  win.addEventListener('hashchange', () => openFromHash(root, win.location.hash));
}
