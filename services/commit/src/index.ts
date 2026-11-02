import { serve } from '@hono/node-server';
import { GameRepoTemplateSource } from '@ogm/game-repo-template';

import { JsonlAuditWriter } from './audit.js';
import { createGitHubApp } from './auth/app.js';
import { BoundaryApiClient } from './boundary/api-client.js';
import { createBlocklistLoader } from './boundary/blocklist.js';
import { BoundaryChecker } from './boundary/checker.js';
import { startBoundaryPoller } from './boundary/poller.js';
import { loadCommitConfig } from './config.js';
import { RealBoundaryGate } from './publish-gate/gate.js';
import { RepoResolver } from './repo-resolver.js';
import { createCommitApp } from './server.js';
import { DefaultTemplateSource, withGameTemplates } from './template-source.js';

async function main(): Promise<void> {
  const config = loadCommitConfig();
  const github = await createGitHubApp({
    appId: config.githubAppId,
    privateKeyPath: config.githubPrivateKeyPath,
  });
  const log = (entry: Record<string, unknown>) => console.log(JSON.stringify(entry));
  const api = new BoundaryApiClient({ baseUrl: config.apiInternalUrl, token: config.internalToken });
  const blocklist = createBlocklistLoader(config.blocklistFile, (message) => log({ event: 'boundary-warning', message }));
  const checker = new BoundaryChecker({ app: github, api, blocklist });
  const runBoundaryCheck = async (request: Parameters<BoundaryChecker['check']>[0]) => {
    await checker.check(request);
  };
  const app = createCommitApp({
    serviceToken: config.serviceToken,
    repos: new RepoResolver(config.apiInternalUrl, config.serviceToken),
    audit: new JsonlAuditWriter(config.dataDirectory),
    operations: {
      app: github,
      gate: new RealBoundaryGate({ app: github, api, blocklist }),
      templates: withGameTemplates(new GameRepoTemplateSource(), new DefaultTemplateSource()),
      builderBotLogin: config.builderBotLogin,
      platformIssueRepo: config.platformIssueRepo,
    },
    boundaryWebhook: {
      secret: config.githubWebhookSecret,
      async resolveRepository(owner, name) {
        const repositories = await api.activeRepositories();
        return repositories.find((repository) =>
          repository.owner.toLocaleLowerCase() === owner.toLocaleLowerCase() &&
          repository.name.toLocaleLowerCase() === name.toLocaleLowerCase()
        );
      },
      run: runBoundaryCheck,
    },
  });
  const poller = startBoundaryPoller({ api, app: github, check: runBoundaryCheck, log });
  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: config.port });
  process.once('SIGTERM', () => {
    poller.stop();
    server.close();
  });
}

await main();
