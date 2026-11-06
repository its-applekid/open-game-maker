import { api, ApiError } from '../../lib/api/client';

import type { VoiceTarget } from '@ogm/contracts';
import type { DictationConnection } from '@ogm/voice-client';

export type BuildVoiceTarget = Extract<VoiceTarget, { kind: 'build' }>;

export type VoiceAvailability =
  { available: true; token: string; url: string; expiresAt: string } | { available: false };

type VoiceTokenResponse = { token: string; url: string; expires_at: string };

export async function probeVoice(target: VoiceTarget): Promise<VoiceAvailability> {
  try {
    const response = await api<VoiceTokenResponse>('/voice/token', { method: 'POST', json: { target } });
    return { available: true, token: response.token, url: response.url, expiresAt: response.expires_at };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 503)) return { available: false };
    throw error;
  }
}

export function connectDictation(target: VoiceTarget): Promise<DictationConnection> {
  return api<VoiceTokenResponse>('/voice/dictation-token', { method: 'POST', json: { target } });
}
