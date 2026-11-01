import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import type { ApiError } from '@ogm/contracts';

import type { ApiBindings } from './types.js';

// Every context throws this; the error handler turns it into the `ApiError` JSON envelope.
export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message?: string,
    readonly details?: unknown,
  ) {
    super(message ?? code);
    this.name = 'HttpError';
  }
}

export function onError(error: Error, c: Context<ApiBindings>): Response {
  if (error instanceof HttpError) {
    const body: ApiError = { error: error.code };
    if (error.message !== error.code) body.message = error.message;
    if (error.details !== undefined) body.details = error.details;
    return c.json(body, error.status);
  }

  const requestId = c.get('requestId');
  c.get('deps')?.log({ event: 'error', requestId, stack: error.stack ?? String(error) });
  return c.json({ error: 'internal', details: { requestId } } satisfies ApiError, 500);
}

export function notFound(c: Context<ApiBindings>): Response {
  return c.json({ error: 'not_found' } satisfies ApiError, 404);
}
