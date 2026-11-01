import type { Viewport } from '@ogm/contracts/game';
import type { Insets } from '@ogm/contracts/input';

type SafeStyle = Pick<CSSStyleDeclaration, 'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft'>;

export interface ViewportTrackerOptions {
  container: HTMLElement;
  send: (viewport: Viewport) => void;
  raf?: (callback: FrameRequestCallback) => number;
  cancelRaf?: (handle: number) => void;
  observe?: (element: Element, callback: () => void) => () => void;
  readStyle?: (element: Element) => SafeStyle;
  dpr?: () => number;
  visualViewport?: VisualViewport | null;
}

export class ViewportTracker {
  private readonly probe: HTMLDivElement;
  private readonly raf: (callback: FrameRequestCallback) => number;
  private readonly cancelRaf: (handle: number) => void;
  private readonly readStyle: (element: Element) => SafeStyle;
  private readonly dpr: () => number;
  private readonly visualViewport: VisualViewport | null;
  private readonly unobserve: () => void;
  private scheduled: number | undefined;

  constructor(private readonly options: ViewportTrackerOptions) {
    this.raf = options.raf ?? window.requestAnimationFrame.bind(window);
    this.cancelRaf = options.cancelRaf ?? window.cancelAnimationFrame.bind(window);
    this.readStyle = options.readStyle ?? ((element) => getComputedStyle(element));
    this.dpr = options.dpr ?? (() => devicePixelRatio);
    this.visualViewport = options.visualViewport === undefined ? window.visualViewport : options.visualViewport;
    this.probe = document.createElement('div');
    Object.assign(this.probe.style, {
      position: 'fixed',
      visibility: 'hidden',
      pointerEvents: 'none',
      paddingTop: 'env(safe-area-inset-top)',
      paddingRight: 'env(safe-area-inset-right)',
      paddingBottom: 'env(safe-area-inset-bottom)',
      paddingLeft: 'env(safe-area-inset-left)',
    });
    options.container.append(this.probe);
    const observe = options.observe ?? this.defaultObserver;
    this.unobserve = observe(options.container, () => this.schedule());
    this.visualViewport?.addEventListener('resize', this.schedule);
    this.visualViewport?.addEventListener('scroll', this.schedule);
    this.schedule();
  }

  sendNow(): void {
    const bounds = this.options.container.getBoundingClientRect();
    const visual = this.visualViewport;
    const width = visual?.width ? Math.min(bounds.width, visual.width) : bounds.width;
    const height = visual?.height ? Math.min(bounds.height, visual.height) : bounds.height;
    const style = this.readStyle(this.probe);
    const safe: Insets = {
      top: this.pixels(style.paddingTop),
      right: this.pixels(style.paddingRight),
      bottom: this.pixels(style.paddingBottom),
      left: this.pixels(style.paddingLeft),
    };
    this.options.send({
      w: Math.max(0, Math.round(width)),
      h: Math.max(0, Math.round(height)),
      dpr: Math.max(0.01, this.dpr()),
      orientation: width >= height ? 'landscape' : 'portrait',
      safe,
    });
  }

  dispose(): void {
    if (this.scheduled !== undefined) this.cancelRaf(this.scheduled);
    this.unobserve();
    this.visualViewport?.removeEventListener('resize', this.schedule);
    this.visualViewport?.removeEventListener('scroll', this.schedule);
    this.probe.remove();
  }

  private readonly schedule = (): void => {
    if (this.scheduled !== undefined) return;
    this.scheduled = this.raf(() => {
      this.scheduled = undefined;
      this.sendNow();
    });
  };

  private readonly defaultObserver = (element: Element, callback: () => void): (() => void) => {
    if (typeof ResizeObserver === 'undefined') return () => undefined;
    const observer = new ResizeObserver(callback);
    observer.observe(element);
    return () => observer.disconnect();
  };

  private pixels(value: string): number {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
