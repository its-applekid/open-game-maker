import type { AchievementDef } from '@ogm/contracts';

export type CatalogLintCode =
  'duplicate_key' | 'invalid_key' | 'invalid_target' | 'missing_retirement' | 'release_conflict' | 'retired_reuse';

export interface CatalogLintIssue {
  code: CatalogLintCode;
  key: string;
}

const keyPattern = /^[a-z0-9-]{1,64}$/;

export function lintCatalog(
  previous: readonly AchievementDef[] | null,
  next: readonly AchievementDef[],
): CatalogLintIssue[] {
  const issues: CatalogLintIssue[] = [];
  const seen = new Set<string>();

  for (const definition of next) {
    if (seen.has(definition.key)) issues.push({ code: 'duplicate_key', key: definition.key });
    seen.add(definition.key);
    if (!keyPattern.test(definition.key)) issues.push({ code: 'invalid_key', key: definition.key });
    if (
      definition.progress !== undefined &&
      (!Number.isFinite(definition.progress.target) || definition.progress.target <= 0)
    ) {
      issues.push({ code: 'invalid_target', key: definition.key });
    }
  }

  if (previous) {
    const nextByKey = new Map(next.map((definition) => [definition.key, definition]));
    for (const definition of previous) {
      const replacement = nextByKey.get(definition.key);
      if (!replacement) issues.push({ code: 'missing_retirement', key: definition.key });
      else if (definition.retired === true && replacement.retired !== true) {
        issues.push({ code: 'retired_reuse', key: definition.key });
      }
    }
  }

  return issues;
}

export class CatalogLintError extends Error {
  constructor(readonly issues: readonly CatalogLintIssue[]) {
    super(`Achievement catalog failed lint: ${issues.map(({ code, key }) => `${key}:${code}`).join(', ')}`);
    this.name = 'CatalogLintError';
  }
}
