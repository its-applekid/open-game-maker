import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { closeSync, ftruncateSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { AgentOutboxLine, ChatPostPayload } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

import { postChat } from '../src/cli.js';
import { gm, tempDir } from './helpers.js';

const JOB_ID = 'j_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e6f';

function workspace(): string {
  const root = tempDir('gm-chat-');
  execFileSync('git', ['init', '-q'], { cwd: root });
  return root;
}

function outbox(root: string) {
  const raw = readFileSync(join(root, '.gm', 'outbox', 'chat.jsonl'), 'utf8').trim();
  return AgentOutboxLine.parse(JSON.parse(raw));
}

describe('gm chat post', () => {
  it('exposes the reusable postChat API with the documented id-only result', async () => {
    const root = workspace();
    const result = await postChat({ cwd: root, job: JOB_ID, text: 'shared helper' });

    expect(result).toEqual({ id: outbox(root).id });
  });

  it('copies a clip and poster by sha256, appends a valid outbox line, and prints its id', async () => {
    const root = workspace();
    const clip = join(root, 'run.mp4');
    const poster = join(root, 't0.png');
    writeFileSync(clip, 'video bytes');
    writeFileSync(poster, 'poster bytes');

    const result = await gm(
      ['chat', 'post', '--job', JOB_ID, '--clip', clip, '--poster', poster, '--text', 'first pass'],
      { cwd: root },
    );

    expect(result).toMatchObject({ code: 0, err: [] });
    const line = outbox(root);
    const payload = ChatPostPayload.parse(line.payload);
    expect(result.out).toEqual([line.id]);
    expect(payload).toEqual({
      kind: 'clip',
      text: 'first pass',
      file: `.gm/outbox/media/${createHash('sha256').update('video bytes').digest('hex')}.mp4`,
      poster: `.gm/outbox/media/${createHash('sha256').update('poster bytes').digest('hex')}.png`,
    });
    expect(readFileSync(join(root, payload.file), 'utf8')).toBe('video bytes');
    expect(readFileSync(join(root, payload.poster ?? ''), 'utf8')).toBe('poster bytes');
  });

  it('resolves the job from .gm/context/job.json and emits one activity line with that job', async () => {
    const root = workspace();
    const context = join(root, '.gm', 'context');
    mkdirSync(context, { recursive: true });
    writeFileSync(join(context, 'job.json'), JSON.stringify({ job_id: JOB_ID, game_id: 'ignored' }));
    const events = join(root, 'events.jsonl');

    const result = await gm(['chat', 'post', '--text', 'room is playable'], {
      cwd: root,
      env: { GM_EVENTS_FILE: events },
    });

    expect(result.code).toBe(0);
    expect(JSON.parse(readFileSync(events, 'utf8'))).toMatchObject({
      event: 'chat.post',
      job_id: JOB_ID,
      payload: { kind: 'text' },
    });
  });

  it('prints the full outbox line with --json', async () => {
    const root = workspace();
    const result = await gm(['chat', 'post', '--job', JOB_ID, '--text', 'one line', '--json'], { cwd: root });
    expect(result.code).toBe(0);
    expect(AgentOutboxLine.parse(JSON.parse(result.out[0]))).toEqual(outbox(root));
  });

  it('exits 2 when no job context exists', async () => {
    const result = await gm(['chat', 'post', '--text', 'hello'], { cwd: workspace() });
    expect(result.code).toBe(2);
    expect(result.err).toEqual([
      'no job id: pass --job or run inside a build workspace. Try: gm chat post --job <id> --text "<one line>"',
    ]);
  });

  it('exits 2 and names the 25 MiB limit for an oversized clip', async () => {
    const root = workspace();
    const clip = join(root, 'large.mp4');
    const poster = join(root, 't0.png');
    const handle = openSync(clip, 'w');
    ftruncateSync(handle, 25 * 1024 * 1024 + 1);
    closeSync(handle);
    writeFileSync(poster, 'poster');

    const result = await gm(
      ['chat', 'post', '--job', JOB_ID, '--clip', clip, '--poster', poster, '--text', 'too large'],
      { cwd: root },
    );

    expect(result.code).toBe(2);
    expect(result.err[0]).toContain('clip exceeds 25 MiB');
  });

  it('refuses to copy media from outside the workspace', async () => {
    const root = workspace();
    const image = join(tempDir('gm-outside-'), 'secret.png');
    writeFileSync(image, 'not workspace media');
    const result = await gm(['chat', 'post', '--job', JOB_ID, '--image', image, '--text', 'outside'], { cwd: root });
    expect(result.code).toBe(2);
    expect(result.err[0]).toContain('image must be inside the workspace');
  });

  it('refuses an existing media file whose bytes do not match its hash name', async () => {
    const root = workspace();
    const image = join(root, 'preview.png');
    const bytes = 'real preview';
    const hash = createHash('sha256').update(bytes).digest('hex');
    const media = join(root, '.gm', 'outbox', 'media');
    mkdirSync(media, { recursive: true });
    writeFileSync(image, bytes);
    writeFileSync(join(media, `${hash}.png`), 'different bytes');

    const result = await gm(['chat', 'post', '--job', JOB_ID, '--image', image, '--text', 'preview'], { cwd: root });

    expect(result.code).toBe(1);
    expect(result.err[0]).toContain('does not match its content hash');
  });
});
