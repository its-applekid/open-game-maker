import { serve } from '@hono/node-server';
import { GameRepoTemplateSource } from '@ogm/game-repo-template';

import { JsonlAuditWriter } from './audit.js';
import { createGitHubApp } from './auth/app.js';
import { loadCommitConfig } from './config.js';
import { DefaultBoundaryGate } from './gate.js';
import { RepoResolver } from './repo-resolver.js';
import { createCommitApp } from './server.js';
import { DefaultTemplateSource, withGameTemplates } from './template-source.js';

async function main(): Promise<void> {
  const config = loadCommitConfig();
  const github = await createGitHubApp({
    appId: config.githubAppId,
    privateKeyPath: config.githubPrivateKeyPath,
  });
  const app = createCommitApp({
    serviceToken: config.serviceToken,
    repos: new RepoResolver(config.apiInternalUrl, config.serviceToken),
    audit: new JsonlAuditWriter(config.dataDirectory),
    operations: {
      app: github,
      gate: new DefaultBoundaryGate(),
      templates: withGameTemplates(new GameRepoTemplateSource(), new DefaultTemplateSource()),
      builderBotLogin: config.builderBotLogin,
      platformIssueRepo: config.platformIssueRepo,
    },
  });
  serve({ fetch: app.fetch, hostname: '127.0.0.1', port: config.port });
}

await main();
