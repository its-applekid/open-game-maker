import type { Context } from 'hono';
import type { z } from 'zod';

import { HttpError } from './errors.js';

function invalid(error: z.ZodError): HttpError {
  const issues = error.issues.map(({ code, path, message }) => ({ code, path, message }));
  return new HttpError(400, 'invalid_request', undefined, issues);
}

export async function parseBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
  const result = schema.safeParse(raw);
  if (!result.success) throw invalid(result.error);
  return result.data;
}

export function parseQuery<S extends z.ZodType>(c: Context, schema: S): z.output<S> {
  const result = schema.safeParse(c.req.query());
  if (!result.success) throw invalid(result.error);
  return result.data;
}
