import { defineConfig } from 'vitest/config';

import { workspaceProjects } from './vitest.workspace.js';

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          include: [],
          name: 'workspace-root',
        },
      },
      ...workspaceProjects,
    ],
  },
});
