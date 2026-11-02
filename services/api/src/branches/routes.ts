import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';

import { authorize } from '@ogm/policy';

import { actorFromPrincipal, requireAuthorization } from '../accounts/families.js';
import { HttpError } from '../app/errors.js';
import { requirePrincipal } from '../app/principal.js';
import type { ApiBindings } from '../app/types.js';
import { parseBody } from '../app/validate.js';
import { BranchArchived, BranchNotFound } from '../design/store.js';
import { findGameForFamily, hasGameGrant, type GameRow } from '../games/games.js';
import {
  CapActive,
  InvalidBranchName,
  MainImmutable,
  NameTaken,
  archiveBranch,
  createBranch,
  getBranch,
  listBranches,
  renameBranch,
} from './service.js';
import { createVersionCounts } from './version-counts.js';

export const prefix = '/api/v1';

const createBody = z.object({ name: z.string(), fromBranchId: z.string().min(1).optional() }).strict();
const renameBody = z.object({ name: z.string() }).strict();

function routeParam(c: Context<ApiBindings>, name: string): string {
  const value = c.req.param(name);
  if (!value) throw new HttpError(400, 'invalid_request');
  return value;
}

function authorizedGame(c: Context<ApiBindings>, action: 'game.edit' | 'game.play'): { game: GameRow; userId: string } {
  const principal = requirePrincipal(c, ['user']);
  const game = findGameForFamily(c.get('deps').db, routeParam(c, 'gameId'), principal.familyId);
  requireAuthorization(
    authorize(
      actorFromPrincipal(principal),
      action,
      action === 'game.edit'
        ? { familyId: game.familyId, ownerId: game.ownerId }
        : {
            familyId: game.familyId,
            ownerId: game.ownerId,
            visibility: game.visibility,
            granted: hasGameGrant(c.get('deps').db, game.id, principal.userId),
          },
    ),
  );
  return { game, userId: principal.userId };
}

function branchError(c: Context<ApiBindings>, error: unknown): Response {
  if (error instanceof CapActive) return c.json({ error: 'cap_active', active: error.active }, 409);
  if (error instanceof NameTaken) return c.json({ error: 'name_taken' }, 409);
  if (error instanceof InvalidBranchName) return c.json({ error: 'invalid_branch_name' }, 422);
  if (error instanceof MainImmutable) return c.json({ error: 'main_immutable' }, 409);
  if (error instanceof BranchArchived) return c.json({ error: 'branch_archived' }, 409);
  if (error instanceof BranchNotFound) return c.json({ error: 'branch_not_found' }, 404);
  throw error;
}

const routes = new Hono<ApiBindings>()
  .post('/games/:gameId/branches', async (c) => {
    const { game, userId } = authorizedGame(c, 'game.edit');
    const body = await parseBody(c, createBody);
    try {
      return c.json(
        createBranch(c.get('deps').sqlite, {
          gameId: game.id,
          name: body.name,
          fromBranchId: body.fromBranchId,
          userId,
        }),
        201,
      );
    } catch (error) {
      return branchError(c, error);
    }
  })
  .get('/games/:gameId/branches', async (c) => {
    const { game } = authorizedGame(c, 'game.play');
    const counts = createVersionCounts(c.get('deps').sqlite);
    const branches = await Promise.all(
      listBranches(c.get('deps').sqlite, game.id).map(async (branch) => ({
        ...branch,
        version: await counts.versionFor(branch),
      })),
    );
    return c.json({ branches });
  })
  .get('/games/:gameId/branches/:branchId', async (c) => {
    const { game } = authorizedGame(c, 'game.play');
    try {
      const branch = getBranch(c.get('deps').sqlite, game.id, routeParam(c, 'branchId'));
      const version = await createVersionCounts(c.get('deps').sqlite).versionFor(branch);
      return c.json({ ...branch, version });
    } catch (error) {
      return branchError(c, error);
    }
  })
  .patch('/games/:gameId/branches/:branchId', async (c) => {
    const { game } = authorizedGame(c, 'game.edit');
    const body = await parseBody(c, renameBody);
    try {
      return c.json(renameBranch(c.get('deps').sqlite, game.id, routeParam(c, 'branchId'), body.name));
    } catch (error) {
      return branchError(c, error);
    }
  })
  .post('/games/:gameId/branches/:branchId/archive', (c) => {
    const { game } = authorizedGame(c, 'game.edit');
    try {
      return c.json(archiveBranch(c.get('deps').sqlite, game.id, routeParam(c, 'branchId')));
    } catch (error) {
      return branchError(c, error);
    }
  });

export default routes;
