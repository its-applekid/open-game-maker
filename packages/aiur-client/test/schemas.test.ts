import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  AiurContractError,
  CancelResultSchema,
  ControlResultSchema,
  EventPageSchema,
  ResetRecordSchema,
  IssueEntrySchema,
  StateSchema,
  TicketProgressSchema,
  TicketUsageSchema,
  UsageAccountsSchema,
  parseContract,
} from '../src/index.js';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
}

describe('aiur response schemas', () => {
  it.each([
    ['usage', TicketUsageSchema],
    ['progress', TicketProgressSchema],
    ['accounts', UsageAccountsSchema],
    ['issue', IssueEntrySchema],
    ['state', StateSchema],
    ['control', ControlResultSchema],
  ] as const)('parses the %s contract fixture', (name, schema) => {
    expect(() => parseContract(schema, fixture(name))).not.toThrow();
  });

  it('parses hand-written and event feed response shapes', () => {
    expect(CancelResultSchema.parse(fixture('cancel-exited'))).toMatchObject({ process: { status: 'exited' } });
    const records = EventPageSchema.parse(fixture('events-page')).records;
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ type: 'event', payload: { lifecycle: 'running' } });
  });

  it('fails loudly when a versioned contract changes', () => {
    const changed = { ...(fixture('usage') as Record<string, unknown>), contract_version: 2 };

    expect(() => parseContract(TicketUsageSchema, changed)).toThrow(AiurContractError);
  });

  it('reports the schema contract when a different contract is received', () => {
    expect(() => parseContract(TicketUsageSchema, fixture('progress'))).toThrow(
      expect.objectContaining({
        expected: 'aiur.ticket_usage v1',
        received: 'aiur.ticket_progress v1',
      }),
    );
  });

  it('allows additive fields on event records', () => {
    const page = fixture('events-page') as { records: Array<Record<string, unknown>> };
    page.records[0]!.future_field = true;

    expect(EventPageSchema.parse(page).records[0]).toHaveProperty('future_field', true);
  });

  it('accepts an HTTP reset record without a WebSocket epoch', () => {
    expect(ResetRecordSchema.parse({ type: 'reset', oldest_seq: 20, head_seq: 30 })).toEqual({
      type: 'reset',
      oldest_seq: 20,
      head_seq: 30,
    });
  });
});
