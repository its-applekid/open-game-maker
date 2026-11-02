import { api, ApiError } from '../../lib/api/client';

export type BuildVoiceTarget = {
  kind: 'build';
  game_id: string;
  job_id: string;
  ticket: string;
  creator_id: string;
};

export type VoiceAvailability =
  { available: true; token: string; url: string; expiresAt: string } | { available: false };

type VoiceTokenResponse = { token: string; url: string; expiresAt: string };

export async function probeVoice(target: BuildVoiceTarget): Promise<VoiceAvailability> {
  try {
    const response = await api<VoiceTokenResponse>('/voice/token', { method: 'POST', json: { target } });
    return { available: true, ...response };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 503)) return { available: false };
    throw error;
  }
}
