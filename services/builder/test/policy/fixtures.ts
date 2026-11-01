import type { RenderInput } from '../../src/policy/types.js';

export const workedInput = {
  repo: 'everdred-games/castle-run',
  baseBranch: 'main',
  workspaceRoot: '/home/orangekid/.local/share/ogm/daemons/castle-run/workspaces',
  port: 4101,
  intakeLogin: 'ogm-intake',
  botAccount: 'ogm-builder',
  kind: 'new_game',
  denyReadRoots: [
    '~/.config/gh',
    '~/.aiur/github-budget',
    '/home/orangekid/games/open-game-maker-2000/assets-local',
    '/home/orangekid/.local/share/ogm/daemons/other-game/workspaces',
  ],
} satisfies RenderInput;
