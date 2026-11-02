import { describe, expect, it } from 'vitest';

import { InstructResponse } from '../src/voice.js';

describe('voice instruction receipt', () => {
  it.each(['delivered', 'queued_at_reset', 'needs_choice', 'failed'] as const)('accepts the %s status', (status) => {
    expect(InstructResponse.parse({ delivery_id: 'voice-receipt', status })).toEqual({
      delivery_id: 'voice-receipt',
      status,
    });
  });

  it('rejects a receipt without a known status', () => {
    expect(InstructResponse.safeParse({ delivery_id: 'voice-receipt' }).success).toBe(false);
    expect(InstructResponse.safeParse({ delivery_id: 'voice-receipt', status: 'maybe' }).success).toBe(false);
  });
});
