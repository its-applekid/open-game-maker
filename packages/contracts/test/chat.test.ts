import { existsSync, readdirSync, readFileSync } from 'node:fs';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { toJSONSchema, type z } from 'zod';

import { AgentOutboxLine, BuildChatMessage, ChatPostPayload, chatSchemas } from '../src/chat.js';
import { loadJson } from './helpers.js';

const packageRoot = new URL('../', import.meta.url);

function fixturesFor(stem: string): string[] {
  const name = /^chat\.(.+)\.v1$/.exec(stem)![1];
  const directory = new URL(`fixtures/chat/${name}/`, packageRoot);
  if (!existsSync(directory)) return [`fixtures/chat/${name}.json`];
  return readdirSync(directory)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => `fixtures/chat/${name}/${entry}`);
}

const shapes = Object.entries(chatSchemas).map(([stem, schema]) => ({ stem, schema: schema as z.ZodType }));

describe('build chat contract', () => {
  it.each(shapes)('$stem fixtures parse and the emitted schema is current', ({ stem, schema }) => {
    const emitted = JSON.parse(readFileSync(new URL(`schemas/${stem}.json`, packageRoot), 'utf8')) as object;
    expect(emitted).toEqual({
      ...toJSONSchema(schema, { target: 'draft-2020-12' }),
      $id: `https://open-game-maker-2000.local/schemas/${stem}.json`,
    });
    const ajv = new Ajv2020.default({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
    addFormats.default(ajv);
    const validate = ajv.compile(emitted);
    for (const file of fixturesFor(stem)) {
      const result = schema.safeParse(loadJson(file));
      expect(result.success, `${file}: ${result.error?.message}`).toBe(true);
      expect(validate(loadJson(file)), `${file}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });

  // The panel and every chat ticket copy this contract, so each rule that keeps a row renderable is enforced.
  it.each([
    { file: 'message.unknown-kind.json', schema: BuildChatMessage, path: 'kind' },
    { file: 'message.media-without-size.json', schema: BuildChatMessage, path: 'media.width' },
    { file: 'outbox-line.bad-type.json', schema: AgentOutboxLine, path: 'type' },
    { file: 'post-payload.image-without-file.json', schema: ChatPostPayload, path: 'file' },
  ])('rejects $file at $path', ({ file, schema, path }) => {
    const result = (schema as z.ZodType).safeParse(loadJson(`fixtures/chat-negative/${file}`));
    expect(result.success).toBe(false);
    expect(result.error!.issues.map((issue) => issue.path.join('.'))).toContain(path);
  });

  it('pairs the agent clip outbox line with the row it becomes', () => {
    const { line, message } = loadJson<{ line: unknown; message: unknown }>('fixtures/chat/agent-clip.json');
    const parsedLine = AgentOutboxLine.parse(line);
    const parsedMessage = BuildChatMessage.parse(message);
    const payload = ChatPostPayload.parse(parsedLine.payload);
    expect(parsedMessage).toMatchObject({
      id: parsedLine.id,
      job_id: parsedLine.job_id,
      at: parsedLine.at,
      actor: 'agent',
      kind: payload.kind,
      text: payload.text,
    });
  });
});
