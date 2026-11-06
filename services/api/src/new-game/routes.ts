import { createHash, timingSafeEqual } from 'node:crypto';

import { Hono, type Context } from 'hono';

import { HttpError } from '../app/errors.js';
import type { ApiBindings } from '../app/types.js';
import { getAttachment, readBlob } from '../build-chat/attachments.js';
import { newGameContext, type NewGameContext } from './context.js';
import { contextTokenSecret, signContextToken, verifyContextToken } from './token.js';

// The private context of one New Game request, for an authorised agent. Nothing here is reachable with a user
// session: a caller presents either a scoped `ngc1` bearer for this one request or the internal token that the
// Executor's unit carries. The parent issue carries only the request's opaque reference, never a credential.
export const prefix = '/internal/new-game';

function sameSecret(given: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

function bearer(c: Context<ApiBindings>): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(c.req.header('authorization') ?? '');
  return match ? match[1] : null;
}

// The Executor's own credential for its internal calls; the same shared secret the API already accepts under
// `Authorization` + `x-ogm-service`, presented in its own header so a scoped token and a service token never mix.
function internal(c: Context<ApiBindings>): boolean {
  const given = c.req.header('x-ogm-internal');
  const deps = c.get('deps');
  return given !== undefined && given !== '' && sameSecret(given, deps.config.internalToken);
}

/**
 * Authorises one request's context: an `ngc1` scoped token whose claims name this request and game, or the internal
 * token. Returns the request row's game id so the route can refuse a token minted for another request.
 */
function authorizeContext(c: Context<ApiBindings>, requestId: string): NewGameContext {
  const deps = c.get('deps');
  const service = internal(c);
  const token = bearer(c);
  // Credentials are checked before the request's existence, so an unauthenticated caller learns nothing.
  if (!service && token === null) throw new HttpError(401, 'unauthenticated');
  let claims = null;
  if (!service) {
    claims = verifyContextToken(token!, contextTokenSecret(deps.config.jobTokenSecret));
    if (claims === null) throw new HttpError(401, 'unauthenticated');
    if (claims.request !== requestId) throw new HttpError(403, 'forbidden');
  }
  const found = newGameContext(deps.db, deps.sqlite, requestId);
  if (found === null) throw new HttpError(404, 'new_game_request_not_found');
  if (claims !== null && claims.game !== found.game.id) throw new HttpError(403, 'forbidden');
  return found;
}

const routes = new Hono<ApiBindings>()
  // The context itself: creation choices, the agreed spec and its revision history, the scope conversation as text
  // (voice transcripts included), attachment metadata and the parent issue this request filed.
  .get('/requests/:requestId', (c) => {
    const requestId = c.req.param('requestId');
    const context = authorizeContext(c, requestId);
    c.get('deps').log({ event: 'new-game-context-read', requestId, gameId: context.game.id });
    return c.json(context);
  })
  // A file the creator pasted into the scope conversation, or an image row's bytes, served only to this request.
  .get('/requests/:requestId/attachments/:attachmentId', async (c) => {
    const requestId = c.req.param('requestId');
    const context = authorizeContext(c, requestId);
    const deps = c.get('deps');
    const attachment = context.attachments.find(({ id }) => id === c.req.param('attachmentId'));
    if (!attachment) throw new HttpError(404, 'attachment_not_found');
    const row = getAttachment(deps.sqlite, attachment.id);
    const bytes = row === null ? null : await readBlob(deps.blobStore, row.blobHash);
    if (!bytes) throw new HttpError(404, 'attachment_not_found');
    return c.body(new Uint8Array(bytes), 200, { 'content-type': attachment.mime });
  })
  // Mints a scoped bearer for one request, so the Executor can hand a worker exactly one request's context.
  .post('/requests/:requestId/token', (c) => {
    const deps = c.get('deps');
    if (!internal(c)) throw new HttpError(401, 'unauthenticated');
    const requestId = c.req.param('requestId');
    const context = newGameContext(deps.db, deps.sqlite, requestId);
    if (context === null) throw new HttpError(404, 'new_game_request_not_found');
    const { token, expiresAt } = signContextToken(
      { request: requestId, game: context.game.id },
      contextTokenSecret(deps.config.jobTokenSecret),
    );
    deps.log({ event: 'new-game-context-token', requestId, gameId: context.game.id });
    return c.json({ request: requestId, game: context.game.id, token, expiresAt }, 201);
  });

export default routes;
