import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { format } from 'prettier';

const PIN = '0f692a45b04bb4ce3e7d8256e134028894bd128b';
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkout = resolve(process.env.AIUR_CHECKOUT ?? '/home/orangekid/github/aiur');
const check = process.argv.includes('--check');
const prettierOptions = {
  printWidth: 120,
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
};

const sources = {
  'schemas/voice-converse.v1.schema.json':
    'packages/aiur-contracts/schemas/voice-converse.v1.schema.json',
  'fixtures/voice-converse.v1.json': 'packages/aiur-contracts/fixtures/voice-converse.v1.json',
};

const adapter = `

export const CLIENT_FRAME_TYPES = [
  'start',
  'audio',
  'text',
  'confirm_draft',
  'discard_draft',
  'end',
] as const;

export const SERVER_FRAME_TYPES = [
  'state',
  'transcript',
  'agent_text',
  'agent_audio',
  'interrupted',
  'draft',
  'delivery',
  'context_gap',
  'error',
  'ended',
] as const;

export type ClientFrameType = (typeof CLIENT_FRAME_TYPES)[number];
export type ServerFrameType = (typeof SERVER_FRAME_TYPES)[number];
export type ClientFrame = Extract<VoiceConverseFrame, { type?: ClientFrameType }>;
export type ServerFrame = Extract<VoiceConverseFrame, { type?: ServerFrameType }>;
export type FrameOf<T extends VoiceConverseFrame['type']> = Extract<
  VoiceConverseFrame,
  { type?: T }
>;
type ExtensibleInput = { v?: 1; [key: string]: unknown };
export type ClientFrameInput =
  | (ExtensibleInput & { type: 'start'; target: Record<string, unknown> })
  | (ExtensibleInput & { type: 'audio'; data_b64: string })
  | (ExtensibleInput & { type: 'text'; text: string })
  | (ExtensibleInput & { type: 'confirm_draft'; draft_id: string; edited_text?: string })
  | (ExtensibleInput & { type: 'discard_draft'; draft_id: string })
  | (ExtensibleInput & { type: 'end' });

const FRAME_TYPES = new Set<string>([...CLIENT_FRAME_TYPES, ...SERVER_FRAME_TYPES]);
const MAX_FRAME_BYTES = 400_000;
const UTF8 = new TextEncoder();

export function encode(frame: ClientFrameInput): string {
  const encoded = JSON.stringify({ ...frame, v: 1 });
  if (UTF8.encode(encoded).byteLength > MAX_FRAME_BYTES) {
    throw new Error('frame_too_large');
  }
  return encoded;
}

export function decode(text: string): VoiceConverseFrame {
  if (UTF8.encode(text).byteLength > MAX_FRAME_BYTES) {
    throw new Error('frame_too_large');
  }

  let frame: unknown;
  try {
    frame = JSON.parse(text);
  } catch {
    throw new Error('invalid_frame');
  }

  if (!frame || typeof frame !== 'object') throw new Error('invalid_frame');
  const candidate = frame as Record<string, unknown>;
  if (candidate.v !== 1) throw new Error('unsupported_version');
  if (typeof candidate.type !== 'string' || !FRAME_TYPES.has(candidate.type)) {
    throw new Error('invalid_frame');
  }
  return candidate as VoiceConverseFrame;
}

export function isServerFrame(frame: VoiceConverseFrame): frame is ServerFrame {
  return SERVER_FRAME_TYPES.includes(frame.type as ServerFrameType);
}
`;

function fromPin(path) {
  return execFileSync('git', ['-C', checkout, 'show', `${PIN}:${path}`], { encoding: 'utf8' });
}

async function expectedFiles() {
  const generated = fromPin('packages/aiur-contracts/src/voice-converse.generated.ts').replace(
    '/* eslint-disable */\n',
    '',
  );
  return {
    'src/wire.ts': await format(
      `// vendored from aiur ${PIN}; do not edit\n${generated.trimEnd()}${adapter}`,
      { ...prettierOptions, parser: 'typescript' },
    ),
    ...Object.fromEntries(
      await Promise.all(
        Object.entries(sources).map(async ([target, source]) => [
          target,
          await format(fromPin(source), { ...prettierOptions, parser: 'json' }),
        ]),
      ),
    ),
  };
}

if (!existsSync(checkout)) {
  if (check) {
    process.stdout.write(`sync-contracts: skipped; aiur checkout not found at ${checkout}\n`);
    process.exit(0);
  }
  throw new Error(`aiur checkout not found at ${checkout}`);
}

let mismatch = false;
for (const [relative, expected] of Object.entries(await expectedFiles())) {
  const target = resolve(packageRoot, relative);
  if (check) {
    if (!existsSync(target) || readFileSync(target, 'utf8') !== expected) {
      process.stderr.write(`sync-contracts: ${relative} differs from aiur ${PIN}\n`);
      mismatch = true;
    }
  } else {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, expected);
    process.stdout.write(`sync-contracts: wrote ${relative}\n`);
  }
}

if (mismatch) process.exit(1);
if (check) process.stdout.write(`sync-contracts: clean at aiur ${PIN}\n`);
