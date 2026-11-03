import type { ChangeNote } from '@ogm/contracts/browser';

import { ApiError } from '../../../lib/api/client';

export function changelogText(changelog: { summary: string; items: readonly ChangeNote[] }): string {
  return [changelog.summary, changelog.items.map(({ text }) => text).join('\n')].filter(Boolean).join('\n\n');
}

export function releaseErrorMessage(error: unknown, fallback = 'Release failed'): string {
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : fallback;
  if (typeof error.body === 'string' && error.body !== '') return error.body;
  if (error.body !== undefined) {
    try {
      return JSON.stringify(error.body);
    } catch {
      return fallback;
    }
  }
  return fallback;
}
