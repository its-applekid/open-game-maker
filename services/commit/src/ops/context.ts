import type { BoundaryGate } from '../gate.js';
import type { TemplateSource } from '../template-source.js';
import type { GameRepository, GitHubApp } from '../types.js';

export type RepositoryResolver = {
  // A game resolves to the instance repository plus the game's folder and current slug.
  resolve(gameId: string): Promise<GameRepository>;
};

export type OperationContext = {
  app: GitHubApp;
  gate: BoundaryGate;
  repos: RepositoryResolver;
  templates: TemplateSource;
  builderBotLogin: string;
  platformIssueRepo: { owner: string; name: string };
};
