import { describe, expect, it } from 'vitest';

import { AiurContractError, AiurHttpError, AiurUnavailableError } from '../src/index.js';

describe('aiur errors', () => {
  it('preserves HTTP status and aiur error code', () => {
    const error = new AiurHttpError(404, 'ticket_not_found', 'Ticket not found', 'http://127.0.0.1:4000');

    expect(error).toMatchObject({ status: 404, code: 'ticket_not_found', daemon: 'http://127.0.0.1:4000' });
  });

  it('records contract and availability context', () => {
    const contract = new AiurContractError('aiur.ticket_usage v1', 'aiur.ticket_usage v2');
    const cause = new Error('connect ECONNREFUSED');
    const unavailable = new AiurUnavailableError('http://127.0.0.1:4000', cause);

    expect(contract).toMatchObject({ expected: 'aiur.ticket_usage v1', received: 'aiur.ticket_usage v2' });
    expect(unavailable).toMatchObject({ daemon: 'http://127.0.0.1:4000', cause });
  });
});
