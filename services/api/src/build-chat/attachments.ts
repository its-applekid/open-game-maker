import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { BlobHash, BlobStore } from '@ogm/blob-store';
import {
  MAX_IMAGE_ATTACHMENT_BYTES,
  MAX_TEXT_ATTACHMENT_BYTES,
  TEXT_ATTACHMENT_TYPES,
  type ChatAttachment,
} from '@ogm/contracts';
import type { Sqlite } from '@ogm/db';

import { HttpError } from '../app/errors.js';
import type { LogLine } from '../app/types.js';
import { MediaError, putCreatorImage } from './media.js';
import { workspaceForJob } from './outbox-relay.js';

// Workspace-relative folder the worker reads attachments from; `.gm/` is gitignored in every game repo.
export const ATTACHMENT_DIR = '.gm/inbox/attachments';
// aiur caps an operator message at 8,000 characters; inlined text files share that room with the creator's words.
export const MIRROR_MESSAGE_CAP = 8000;

export type AttachmentRow = ChatAttachment & {
  jobId: string;
  creatorId: string;
  messageId: string | null;
  blobHash: BlobHash;
  createdAt: string;
};

const columns = `id, job_id AS jobId, creator_id AS creatorId, message_id AS messageId, kind, name, mime,
  blob_hash AS blobHash, bytes, created_at AS createdAt`;

// The type the request declares, lower-cased and without parameters such as `charset`.
export function attachmentType(header: string | undefined): 'image' | (typeof TEXT_ATTACHMENT_TYPES)[number] {
  const type = (header ?? '').split(';', 1)[0]!.trim().toLowerCase();
  if (type.startsWith('image/')) return 'image';
  const text = TEXT_ATTACHMENT_TYPES.find((allowed) => allowed === type);
  if (text === undefined) throw new HttpError(415, 'unsupported_attachment_type');
  return text;
}

export function attachmentLimit(type: ReturnType<typeof attachmentType>): number {
  return type === 'image' ? MAX_IMAGE_ATTACHMENT_BYTES : MAX_TEXT_ATTACHMENT_BYTES;
}

// The creator's file name as shown on the chip: the last path segment, without control characters, at most 200 chars.
export function displayName(header: string | undefined, fallback: string): string {
  let raw = header ?? '';
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // An undecodable name is shown as sent.
  }
  // eslint-disable-next-line no-control-regex
  const name = (raw.split(/[\\/]/).at(-1) ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (name === '' ? fallback : name).slice(0, 200);
}

// Validates and stores one upload. Images are re-encoded (no source metadata survives); text must be UTF-8, and JSON
// must parse, so the worker never receives a file it cannot read.
export async function storeAttachment(
  sqlite: Sqlite,
  blobStore: BlobStore,
  input: {
    jobId: string;
    creatorId: string;
    type: ReturnType<typeof attachmentType>;
    name: string;
    bytes: Uint8Array;
  },
): Promise<AttachmentRow> {
  let hash: BlobHash;
  let mime: ChatAttachment['mime'];
  let size: number;
  if (input.type === 'image') {
    const image = await putCreatorImage(blobStore, input.bytes).catch((error: unknown) => {
      if (error instanceof MediaError) throw new HttpError(422, 'invalid_image');
      throw error;
    });
    hash = image.hash;
    mime = 'image/webp';
    size = (await blobStore.head(hash))?.bytes ?? input.bytes.byteLength;
  } else {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(input.bytes);
    } catch {
      throw new HttpError(422, 'invalid_text');
    }
    if (input.type === 'application/json') {
      try {
        JSON.parse(text);
      } catch {
        throw new HttpError(422, 'invalid_json');
      }
    }
    ({ hash } = await blobStore.put(input.bytes, input.type));
    mime = input.type;
    size = input.bytes.byteLength;
  }
  const row: AttachmentRow = {
    id: `a_${randomUUID()}`,
    jobId: input.jobId,
    creatorId: input.creatorId,
    messageId: null,
    kind: input.type === 'image' ? 'image' : 'text',
    name: input.name,
    mime,
    blobHash: hash,
    bytes: size,
    createdAt: new Date().toISOString(),
  };
  sqlite
    .prepare(
      `INSERT INTO build_chat_attachments (id, job_id, creator_id, message_id, kind, name, mime, blob_hash, bytes, created_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
    )
    .run(row.id, row.jobId, row.creatorId, row.kind, row.name, row.mime, row.blobHash, row.bytes, row.createdAt);
  return row;
}

// Binds uploads to a message. Each id must be an unclaimed upload by the same creator for the same job; run inside the
// transaction that inserts the message so a failed claim stores nothing.
export function claimAttachments(
  sqlite: Sqlite,
  input: { ids: string[]; jobId: string; creatorId: string; messageId: string },
): AttachmentRow[] {
  const claim = sqlite.prepare(
    `UPDATE build_chat_attachments SET message_id = ?
     WHERE id = ? AND job_id = ? AND creator_id = ? AND message_id IS NULL`,
  );
  for (const id of input.ids) {
    if (claim.run(input.messageId, id, input.jobId, input.creatorId).changes !== 1) {
      throw new HttpError(422, 'attachment_not_found');
    }
  }
  return messageAttachments(sqlite, input.messageId);
}

export function messageAttachments(sqlite: Sqlite, messageId: string): AttachmentRow[] {
  return sqlite
    .prepare(`SELECT ${columns} FROM build_chat_attachments WHERE message_id = ? ORDER BY created_at, id`)
    .all(messageId) as AttachmentRow[];
}

export function jobAttachments(sqlite: Sqlite, jobId: string): AttachmentRow[] {
  return sqlite
    .prepare(
      `SELECT ${columns} FROM build_chat_attachments
       WHERE job_id = ? AND message_id IS NOT NULL ORDER BY created_at, id`,
    )
    .all(jobId) as AttachmentRow[];
}

export function getAttachment(sqlite: Sqlite, id: string): AttachmentRow | null {
  return (
    (sqlite.prepare(`SELECT ${columns} FROM build_chat_attachments WHERE id = ?`).get(id) as AttachmentRow) ?? null
  );
}

export function toChatAttachment(row: AttachmentRow): ChatAttachment {
  return { id: row.id, kind: row.kind, name: row.name, mime: row.mime, bytes: row.bytes };
}

// `<id>-<name>` with only portable characters; images take the stored `.webp` extension.
export function workspaceFile(row: Pick<AttachmentRow, 'id' | 'kind' | 'name'>): string {
  const stem = row.kind === 'image' ? row.name.replace(/\.[^.]*$/, '') : row.name;
  const safe = stem
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 180);
  return `${row.id}-${safe === '' ? 'file' : safe}${row.kind === 'image' ? '.webp' : ''}`;
}

export function workspacePath(row: Pick<AttachmentRow, 'id' | 'kind' | 'name'>): string {
  return `${ATTACHMENT_DIR}/${workspaceFile(row)}`;
}

async function readBlob(blobStore: BlobStore, hash: BlobHash): Promise<Buffer | null> {
  const opened = await blobStore.open(hash);
  if (!opened) return null;
  const chunks: Buffer[] = [];
  for await (const chunk of opened.stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

// What the worker reads in its aiur message: the creator's words, then each file. Text is inlined while it fits under
// aiur's cap; every file is also named by its workspace path, and images carry a signed URL as a fallback.
export async function mirrorText(
  text: string | null,
  rows: AttachmentRow[],
  deps: { blobStore: BlobStore; sign: (hash: BlobHash) => Promise<string> },
): Promise<string> {
  const parts = text === null ? [] : [text];
  let used = text?.length ?? 0;
  for (const row of rows) {
    const path = workspacePath(row);
    if (row.kind === 'image') {
      const signed = `Creator attached the image "${row.name}" at ${path} (also ${await deps.sign(row.blobHash)}).`;
      const line =
        used + signed.length + 2 <= MIRROR_MESSAGE_CAP
          ? signed
          : `Creator attached the image "${row.name}" at ${path}.`;
      parts.push(line);
      used += line.length + 2;
      continue;
    }
    const content = (await readBlob(deps.blobStore, row.blobHash))?.toString('utf8') ?? '';
    const fence = content.includes('```') ? '````' : '```';
    const inline = `Creator attached the file "${row.name}" at ${path}:\n${fence}\n${content}\n${fence}`;
    const line =
      used + inline.length + 2 <= MIRROR_MESSAGE_CAP
        ? inline
        : `Creator attached the file "${row.name}" at ${path} (too long to include here; read it there).`;
    parts.push(line);
    used += line.length + 2;
  }
  // Only a near-cap message with many files can still overflow; the paths come last, so the creator's words survive.
  return parts.join('\n\n').slice(0, MIRROR_MESSAGE_CAP);
}

// Copies a message's files into the job's pinned workspace so the running worker can open them. Returns false when the
// job has no workspace yet; the after_create hook then fetches them through the job bundle.
export async function writeAttachmentInbox(
  deps: { sqlite: Sqlite; blobStore: BlobStore; log: (line: LogLine) => void },
  jobId: string,
  rows: AttachmentRow[],
): Promise<boolean> {
  const workspace = workspaceForJob(deps.sqlite, jobId);
  if (workspace === null) return false;
  const directory = join(workspace, ATTACHMENT_DIR);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  for (const row of rows) {
    const bytes = await readBlob(deps.blobStore, row.blobHash);
    if (bytes === null) {
      deps.log({ event: 'attachment-blob-missing', jobId, attachmentId: row.id });
      continue;
    }
    const target = join(directory, workspaceFile(row));
    const temporary = join(directory, `.${row.id}.${randomUUID()}.tmp`);
    await writeFile(temporary, bytes, { mode: 0o600 });
    await rename(temporary, target);
  }
  return true;
}
