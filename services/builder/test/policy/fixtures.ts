import type { RenderInput } from '../../src/policy/types.js';

export const workedInput = {
  repo: 'everdred-games/castle-run',
  baseBranch: 'main',
  workspaceRoot: '/srv/ogm-test/.local/share/ogm/daemons/castle-run/workspaces',
  port: 4101,
  // The daemon's label prefix is its game slug, so aiur only transitions this game's labels on the shared repo.
  labelPrefix: 'castle-run',
  intakeLogin: 'ogm-intake',
  botAccount: 'ogm-builder',
  kind: 'new_game',
  denyReadRoots: [
    '~/.config/gh',
    '~/.aiur/github-budget',
    '/srv/ogm-test/games/open-game-maker-2000/assets-local',
    '/srv/ogm-test/.local/share/ogm/daemons/other-game/workspaces',
  ],
} satisfies RenderInput;
