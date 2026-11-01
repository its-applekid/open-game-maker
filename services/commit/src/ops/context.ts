import type { BoundaryGate } from '../gate.js';
import type { TemplateSource } from '../template-source.js';
import type { GitHubApp, Repository } from '../types.js';

export type RepositoryResolver = {
  resolve(gameId: string): Promise<Repository>;
};

export type OperationContext = {
  app: GitHubApp;
  gate: BoundaryGate;
  repos: RepositoryResolver;
  templates: TemplateSource;
  builderBotLogin: string;
  platformIssueRepo: { owner: string; name: string };
};
