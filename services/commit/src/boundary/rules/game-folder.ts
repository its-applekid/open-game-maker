import { PACKAGES_ROOT } from '../../paths.js';
import type { BoundaryReason, BoundaryRule } from '../types.js';

function reason(path: string, detail: string): BoundaryReason {
  return { code: 'path', path, detail };
}

/*
 * The instance-repository path guard. A game's change may only touch that game's own folder; `packages/` is shared by
 * every game in the instance, so only a change the executor approved as a promotion may write there. Anything else —
 * another game's folder, a repository root file, a workflow — is refused here rather than by convention.
 */
export const gameFolderRule: BoundaryRule = (input) => {
  const gamePath = input.gamePath;
  if (gamePath === undefined) return [];
  const prefix = gamePath.endsWith('/') ? gamePath : `${gamePath}/`;
  const reasons: BoundaryReason[] = [];
  for (const file of input.files) {
    const path = file.path.replaceAll('\\', '/');
    if (path.startsWith(prefix)) continue;
    if (input.promotion === true && (path === PACKAGES_ROOT || path.startsWith(`${PACKAGES_ROOT}/`))) continue;
    reasons.push(
      reason(
        file.path,
        input.promotion === true
          ? `a game's change may only touch its own folder (${prefix}) or an approved promotion under packages/`
          : `a game's change may only touch its own folder (${prefix})`,
      ),
    );
  }
  return reasons;
};
