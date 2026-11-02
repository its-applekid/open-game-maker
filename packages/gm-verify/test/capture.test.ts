import { describe, expect, it } from 'vitest';

import { clipArgs, normalizeClipArgs, streamClipArgs } from '../src/capture.js';

describe('clipArgs', () => {
  it('keeps the phone-safe 960 pixel encode as the default', () => {
    const args = clipArgs('/frames', 30, '/out.mp4');

    expect(args).toContain('scale=960:-2:in_range=full:out_range=tv,format=yuv420p');
    expect(args).toEqual(expect.arrayContaining(['-framerate', '30', '-pix_fmt', 'yuv420p', '+faststart']));
  });

  it('preserves native frame dimensions for an opt-in 60 fps encode', () => {
    const args = clipArgs('/frames', 60, '/out.mp4', true);

    expect(args).toContain('scale=iw:ih:in_range=full:out_range=tv,format=yuv420p');
    expect(args).not.toContain('scale=960:-2:in_range=full:out_range=tv,format=yuv420p');
    expect(args).toEqual(expect.arrayContaining(['-framerate', '60', '-pix_fmt', 'yuv420p', '+faststart']));
  });

  it('scales logical pixels to a native viewport with nearest-neighbour sampling', () => {
    const args = clipArgs('/frames', 60, '/out.mp4', true, { width: 1440, height: 900 });

    expect(args).toContain('scale=1440:900:flags=neighbor:in_range=full:out_range=tv,format=yuv420p');
  });
});

describe('streamClipArgs', () => {
  it('retimes browser canvas samples into an exact native 60 fps clip', () => {
    const args = streamClipArgs('/capture.webm', 60, 12, 4, '/out.mp4', true, { width: 1440, height: 900 });

    expect(args).toContain(
      'setpts=N/(12*TB),tpad=stop_mode=clone:stop_duration=4,fps=60,scale=1440:900:flags=neighbor:in_range=full:out_range=tv,format=yuv420p',
    );
    expect(args).toEqual(expect.arrayContaining(['-t', '4', '-frames:v', '240', '-pix_fmt', 'yuv420p', '+faststart']));
  });

  it('normalizes dropped browser samples to the exact delivery length', () => {
    const args = normalizeClipArgs('/staged.mp4', 60, 4, '/out.mp4');

    expect(args).toContain('tpad=stop_mode=clone:stop_duration=4,fps=60,trim=duration=4,format=yuv420p');
    expect(args).toEqual(expect.arrayContaining(['-t', '4', '-frames:v', '240', '-an', '+faststart']));
  });
});
