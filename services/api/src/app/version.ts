import { execFileSync } from 'node:child_process';

export function readGitVersion(): string {
  try {
    const version = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2_000,
    }).trim();
    return /^[0-9a-f]{40}$/.test(version) ? version : 'dev';
  } catch {
    return 'dev';
  }
}
