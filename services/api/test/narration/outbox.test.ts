import type { AgentOutboxLine } from '@ogm/contracts';
import { describe, expect, it, vi } from 'vitest';

import { handle } from '../../src/narration/outbox.js';
import { listSince } from '../../src/build-chat/store.js';
import { makeDeps } from '../helpers.js';
import { JOB_ID } from '../build-chat/setup.js';

const line: AgentOutboxLine = {
  v: 1,
  id: '01JBX2Q7M3K8V5N4R6T9W0YZAB',
  job_id: JOB_ID,
  at: '2026-11-01T09:12:30Z',
  type: 'narration.render',
  payload: {
    lines: [
      { id: 'intro', text: 'Hello there.' },
      { id: 'win', text: 'You did it!' },
    ],
  },
};

describe('narration outbox handler', () => {
  it('uses the pinned job game and publishes one summary row', async () => {
    const deps = makeDeps();
    const publish = vi.fn();
    const renderNarration = vi.fn(async () => [
      { id: 'intro', key: 'a'.repeat(64), audio_url: 'https://a', alignment_url: 'https://j', cached: false },
      { id: 'win', key: 'b'.repeat(64), audio_url: 'https://b', alignment_url: 'https://k', cached: true },
    ]);

    await handle(line, {
      jobId: JOB_ID,
      gameId: 'g_game',
      workspaceRoot: '/tmp/workspace',
      sqlite: deps.sqlite,
      blobStore: deps.blobStore,
      renderNarration,
      publish,
      log: deps.log,
    });

    expect(renderNarration).toHaveBeenCalledWith(line.payload.lines);
    expect(listSince(deps.sqlite, JOB_ID, 0)).toMatchObject([
      { id: line.id, actor: 'system', kind: 'text', text: 'Rendered 2 narration lines, 1 cached.' },
    ]);
    expect(publish).toHaveBeenCalledWith(JOB_ID);
  });
});
