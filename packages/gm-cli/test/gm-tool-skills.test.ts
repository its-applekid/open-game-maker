import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SKILLS = fileURLToPath(new URL('../../../skills/', import.meta.url));

function skill(name: string): { lines: string[]; text: string } {
  const text = readFileSync(`${SKILLS}/${name}/SKILL.md`, 'utf8');
  return { lines: text.trimEnd().split('\n'), text };
}

describe('local media and 3D skills', () => {
  it('keeps gm-video short, pinned, local, and independently verifiable', () => {
    const { lines, text } = skill('gm-video');

    expect(lines.length).toBeLessThanOrEqual(80);
    expect(text).toContain('hyperframes@0.9.8');
    expect(text).toContain('HYPERFRAMES_NO_TELEMETRY=1');
    expect(text).toContain('FFmpeg');
    expect(text).toContain('H.264');
    expect(text).toContain('yuv420p');
    expect(text).toContain('`moov` before `mdat`');
    expect(text).toContain('assets-local/sets/examples/gm-video/video.mp4');
    expect(text).toContain('provider key');
    expect(text).toContain('current Standard license');
    expect(text).not.toMatch(/npx hyperframes@(latest|next)/i);
  });

  it('keeps gm-voiceover pinned, consented, local, and script-led', () => {
    const { lines, text } = skill('gm-voiceover');

    expect(lines.length).toBeLessThanOrEqual(90);
    expect(text).toContain('chatterbox-tts==0.1.7');
    expect(text).toContain('torch==2.6.0');
    expect(text).toContain('torchaudio==2.6.0');
    expect(text).toContain('--no-deps');
    expect(text).toContain('5de7a54aa4e5e2baadb0182dde554908b48b85c2');
    expect(text).toContain('71ccd1d0081b430592cea481f4307e764e07bc64');
    expect(text).toContain('faster-whisper==1.2.1');
    expect(text).toContain('av==16.0.1');
    expect(text).toContain('0d3d19a32d3338f10357c0889762bd8d64bbdeba');
    expect(text.replace(/\s+/gu, ' ')).toContain('caption source of truth');
    expect(text).toContain('explicit consent');
    expect(text).toContain('over 5 GB');
    expect(text).toContain('assets-local/sets/examples/gm-voiceover/voiceover.wav');
    expect(text).not.toMatch(/ElevenLabs|provider API|upload the voice/i);
  });

  it('keeps gm-3d on deterministic CLI authoring and existing runtime guidance', () => {
    const { lines, text } = skill('gm-3d');

    expect(lines.length).toBeLessThanOrEqual(80);
    expect(text).toContain('blender --background --python-exit-code 1 --python scene.py');
    expect(text).toContain('vendor/threejs');
    expect(text).toContain('asset provenance');
    expect(text).toContain('MCP configuration');
    expect(text).toContain('assets-local/sets/examples/gm-3d/turntable.mp4');
  });
});
