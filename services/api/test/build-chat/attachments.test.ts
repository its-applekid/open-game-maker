import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createAiurClient } from '@ogm/aiur-client';
import { BuildChatMessage, ChatAttachment, ChatMessagesPage } from '@ogm/contracts';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

import { MIRROR_MESSAGE_CAP } from '../../src/build-chat/attachments.js';
import { registerWorkspace } from '../../src/build-chat/outbox-relay.js';
import { listSince } from '../../src/build-chat/store.js';
import { as, chatJob, jobTable, JOB_ID, makeChatApp, OTHER_JOB_ID } from './setup.js';

const url = (path = '', jobId = JOB_ID) => `/api/v1/jobs/${jobId}/chat${path}`;
const json = { 'content-type': 'application/json' };
const MARKDOWN = '# Castle\n\nFour towers, a moat, and a drawbridge that opens at dawn.\n';

function recordingAiur() {
  const texts: string[] = [];
  const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    texts.push((JSON.parse(String(init?.body)) as { text: string }).text);
    return new Response(JSON.stringify({ request_id: 'req-1' }), {
      status: 202,
      headers: { 'content-type': 'application/json' },
    });
  });
  return {
    client: createAiurClient({ baseUrl: 'http://127.0.0.1:4101', token: 'aiur-token-for-tests' }, fetchImpl),
    texts,
  };
}

function png() {
  return sharp({ create: { width: 4, height: 3, channels: 3, background: { r: 200, g: 40, b: 40 } } })
    .png()
    .toBuffer();
}

type App = Awaited<ReturnType<typeof makeChatApp>>['app'];

function upload(app: App, body: BodyInit, type: string, name?: string, jobId = JOB_ID) {
  return app.request(url('/attachments', jobId), {
    method: 'POST',
    headers: { 'content-type': type, ...(name ? { 'x-file-name': encodeURIComponent(name) } : {}), ...as('owner') },
    body,
  });
}

async function uploaded(app: App, body: BodyInit, type: string, name?: string, jobId = JOB_ID) {
  const response = await upload(app, body, type, name, jobId);
  expect(response.status).toBe(201);
  return ChatAttachment.parse(await response.json());
}

function post(app: App, body: unknown) {
  return app.request(url(), { method: 'POST', headers: { ...json, ...as('owner') }, body: JSON.stringify(body) });
}

describe('build chat attachments', () => {
  // Acceptance: one image and one markdown file reach the worker as workspace files, with the markdown inlined in the
  // message and the image named as an attachment.
  it('posts an image and a markdown file, copies both to the workspace and mirrors the markdown inline', async () => {
    const aiur = recordingAiur();
    const { app, deps } = await makeChatApp(jobTable(chatJob()), aiur.client);
    const workspace = mkdtempSync(join(tmpdir(), 'ogm-attach-ws-'));
    registerWorkspace(deps.sqlite, JOB_ID, workspace);

    const image = await uploaded(app, new Uint8Array(await png()), 'image/png', 'castle sketch.png');
    const notes = await uploaded(app, MARKDOWN, 'text/markdown; charset=utf-8', 'C:\\Users\\kid\\level notes.md');
    expect(image).toMatchObject({ kind: 'image', name: 'castle sketch.png', mime: 'image/webp' });
    expect(notes).toEqual({
      id: notes.id,
      kind: 'text',
      name: 'level notes.md',
      mime: 'text/markdown',
      bytes: Buffer.byteLength(MARKDOWN),
    });

    const response = await post(app, { text: 'build this castle', attachments: [image.id, notes.id] });
    expect(response.status).toBe(201);
    const message = BuildChatMessage.parse(await response.json());
    expect(message.attachments).toEqual([image, notes]);

    await vi.waitFor(() => expect(aiur.texts).toHaveLength(1));
    const text = aiur.texts[0]!;
    expect(text.startsWith('build this castle\n\n')).toBe(true);
    expect(text).toContain(`.gm/inbox/attachments/${notes.id}-level-notes.md:\n\`\`\`\n${MARKDOWN}\n\`\`\``);
    expect(text).toContain(`"castle sketch.png" at .gm/inbox/attachments/${image.id}-castle-sketch.webp`);

    const inbox = join(workspace, '.gm/inbox/attachments');
    expect(readdirSync(inbox).sort()).toEqual([`${image.id}-castle-sketch.webp`, `${notes.id}-level-notes.md`].sort());
    expect(readFileSync(join(inbox, `${notes.id}-level-notes.md`), 'utf8')).toBe(MARKDOWN);
    expect((await sharp(join(inbox, `${image.id}-castle-sketch.webp`)).metadata()).format).toBe('webp');

    const page = ChatMessagesPage.parse(await (await app.request(url('/messages'), { headers: as('owner') })).json());
    expect(page.messages[0]?.attachments).toEqual([image, notes]);
  });

  it('accepts a message made only of attachments', async () => {
    const { app, deps } = await makeChatApp();
    const notes = await uploaded(app, '{"lives":3}', 'application/json', 'rules.json');
    expect((await post(app, { attachments: [notes.id] })).status).toBe(201);
    expect(listSince(deps.sqlite, JOB_ID, 0)).toMatchObject([{ actor: 'creator', kind: 'text', text: null }]);
  });

  // With the file in the workspace the message points at it instead of spending aiur's cap on its content.
  it('names a text file too long to inline by its workspace path when the workspace has it', async () => {
    const aiur = recordingAiur();
    const { app, deps } = await makeChatApp(jobTable(chatJob()), aiur.client);
    registerWorkspace(deps.sqlite, JOB_ID, mkdtempSync(join(tmpdir(), 'ogm-attach-ws-')));
    const long = await uploaded(app, 'x'.repeat(MIRROR_MESSAGE_CAP), 'text/plain', 'long.txt');
    expect((await post(app, { text: 'see the file', attachments: [long.id] })).status).toBe(201);
    await vi.waitFor(() => expect(aiur.texts).toHaveLength(1));
    expect(aiur.texts[0]).toBe(
      `see the file\n\nCreator attached the file "long.txt" at .gm/inbox/attachments/${long.id}-long.txt.`,
    );
  });

  // No workspace is pinned for the job, so the message is the worker's only copy: no path it cannot open, and as much of
  // the text as fits.
  it('inlines a cut-down copy and names no path when the workspace does not have the files', async () => {
    const aiur = recordingAiur();
    const { app } = await makeChatApp(jobTable(chatJob()), aiur.client);
    const long = await uploaded(app, 'x'.repeat(MIRROR_MESSAGE_CAP), 'text/plain', 'long.txt');
    const image = await uploaded(app, new Uint8Array(await png()), 'image/png', 'door.png');
    expect((await post(app, { text: 'see the files', attachments: [long.id, image.id] })).status).toBe(201);
    await vi.waitFor(() => expect(aiur.texts).toHaveLength(1));
    const text = aiur.texts[0]!;
    expect(text.length).toBeLessThanOrEqual(MIRROR_MESSAGE_CAP);
    expect(text).not.toContain('.gm/inbox');
    expect(text).toMatch(/Creator attached the file "long.txt":\n```\nx{1000,}\n\(truncated\)\n```/);
    expect(text).toContain('Creator attached the image "door.png"');
  });

  // aiur caps a message at 8,000 characters; a full-length post must not push its files out of the message.
  it('keeps every file reference when the creator text is already at the cap', async () => {
    const aiur = recordingAiur();
    const { app } = await makeChatApp(jobTable(chatJob()), aiur.client);
    const ids = [];
    for (const name of ['a.md', 'b.md', 'c.md']) ids.push((await uploaded(app, '# notes', 'text/markdown', name)).id);
    expect((await post(app, { text: 'y'.repeat(8000), attachments: ids })).status).toBe(201);
    await vi.waitFor(() => expect(aiur.texts).toHaveLength(1));
    expect(aiur.texts[0]!.length).toBeLessThanOrEqual(MIRROR_MESSAGE_CAP);
    for (const name of ['a.md', 'b.md', 'c.md']) expect(aiur.texts[0]).toContain(`Creator attached the file "${name}"`);
  });

  it.each([
    ['a shell script', 'application/x-sh', 'echo hi', 415, 'unsupported_attachment_type'],
    ['a PDF', 'application/pdf', '%PDF-1.7', 415, 'unsupported_attachment_type'],
    ['text over 64 KB', 'text/plain', 'a'.repeat(64 * 1024 + 1), 413, 'attachment_too_large'],
    ['text that is not UTF-8', 'text/plain', new Uint8Array([0xff, 0xfe, 0xfd]), 422, 'invalid_text'],
    ['JSON that does not parse', 'application/json', '{"lives":', 422, 'invalid_json'],
    ['an undecodable image', 'image/png', 'not a png', 422, 'invalid_image'],
    ['an empty file', 'text/plain', '', 400, 'empty_attachment'],
  ] as const)('refuses %s', async (_label, type, body, status, code) => {
    const { app, deps } = await makeChatApp();
    const response = await upload(app, body, type, 'file');
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: code });
    expect(deps.sqlite.prepare('SELECT count(*) AS n FROM build_chat_attachments').get()).toEqual({ n: 0 });
  });

  it('refuses an image declared or streamed over 10 MiB before reading it all', async () => {
    const { app } = await makeChatApp();
    const declared = await app.request(url('/attachments'), {
      method: 'POST',
      headers: { 'content-type': 'image/png', 'content-length': String(10 * 1024 * 1024 + 1), ...as('owner') },
      body: 'x',
    });
    expect(declared.status).toBe(413);
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk.byteLength;
        controller.enqueue(chunk);
        if (sent > 11 * 1024 * 1024) controller.close();
      },
    });
    const streamed = await app.request(url('/attachments'), {
      method: 'POST',
      headers: { 'content-type': 'image/png', ...as('owner') },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    expect(streamed.status).toBe(413);
  });

  it('refuses an upload from anyone but the job creator', async () => {
    const { app } = await makeChatApp();
    for (const user of ['sibling', 'player', 'maintainer'] as const) {
      const response = await app.request(url('/attachments'), {
        method: 'POST',
        headers: { 'content-type': 'text/plain', ...as(user) },
        body: 'hi',
      });
      expect(response.status).toBe(403);
    }
  });

  // A post may only claim the creator's own unsent uploads for this job; otherwise nothing is stored.
  it('refuses more than 8 files, a reused file and a file uploaded to another job', async () => {
    const { app, deps } = await makeChatApp(jobTable(chatJob(), chatJob({ jobId: OTHER_JOB_ID })));
    const ids = [];
    for (let index = 0; index < 9; index += 1) ids.push((await uploaded(app, `note ${index}`, 'text/plain')).id);
    expect((await post(app, { text: 'nine', attachments: ids })).status).toBe(400);

    expect((await post(app, { text: 'first', attachments: [ids[0]] })).status).toBe(201);
    const reused = await post(app, { text: 'again', attachments: [ids[1], ids[0]] });
    expect(reused.status).toBe(422);
    expect(await reused.json()).toEqual({ error: 'attachment_not_found' });

    const foreign = await uploaded(app, 'other', 'text/plain', 'x.txt', OTHER_JOB_ID);
    expect((await post(app, { text: 'foreign', attachments: [foreign.id] })).status).toBe(422);

    expect(listSince(deps.sqlite, JOB_ID, 0).map((row) => row.text)).toEqual(['first']);
    const unclaimed = deps.sqlite
      .prepare('SELECT count(*) AS n FROM build_chat_attachments WHERE message_id IS NULL')
      .get() as { n: number };
    expect(unclaimed.n).toBe(9);
  });
});
