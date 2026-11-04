import { useEffect, useRef } from 'react';
import { Link } from 'react-router';

const GLOWS = [
  ['214,93,14', 0.32, 0.1, 0.1, 41],
  ['177,98,134', 0.3, 0.9, 0.15, 53],
  ['69,133,136', 0.34, 0.35, 0.95, 47],
  ['215,153,33', 0.2, 0.85, 0.9, 61],
  ['104,157,106', 0.16, 0.55, 0.45, 37],
] as const;

export function StudioBackdrop() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (import.meta.env.MODE === 'test') return;
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let last = -Infinity;

    const draw = (now: number) => {
      if (now - last >= 66 || reduced) {
        last = now;
        const width = context.canvas.width;
        const height = context.canvas.height;
        const time = reduced ? 0 : now / 1000;
        context.fillStyle = '#0f0e16';
        context.fillRect(0, 0, width, height);
        GLOWS.forEach(([rgb, alpha, x0, y0, period], index) => {
          const phase = (time / period) * Math.PI * 2;
          const x = (x0 + 0.16 * Math.sin(phase + index) + 0.06 * Math.sin(phase * 2.3)) * width;
          const y = (y0 + 0.14 * Math.cos(phase * 0.8 + index * 2)) * height;
          const radius = width * (0.42 + 0.08 * Math.sin(phase * 1.7));
          const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
          gradient.addColorStop(0, `rgba(${rgb},${alpha})`);
          gradient.addColorStop(0.55, `rgba(${rgb},${alpha * 0.45})`);
          gradient.addColorStop(1, `rgba(${rgb},0)`);
          context.fillStyle = gradient;
          context.fillRect(0, 0, width, height);
        });
      }
      if (!reduced) frame = requestAnimationFrame(draw);
    };

    draw(0);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="studio-backdrop" aria-hidden="true">
      <canvas ref={canvas} width="64" height="40" />
    </div>
  );
}

export function StudioLogo() {
  return (
    <Link className="studio-logo" to="/" aria-label="Open Game Maker 2000">
      <img src="/art/gm.webp" alt="" />
    </Link>
  );
}
