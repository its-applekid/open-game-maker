import { posix } from 'node:path';

import type { BoundaryReason, BoundaryRule } from '../types.js';

function agentArtifact(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  const basename = posix.basename(normalized);
  return (
    /\.workpad\.md$/iu.test(basename) || /^transcript.*\.(?:md|txt|json)$/iu.test(basename) || normalized === 'plan.md'
  );
}

export const denylistRule: BoundaryRule = (input) => {
  const reasons: BoundaryReason[] = [];
  if (input.blocklist === null && input.visibility === 'public') {
    reasons.push({ code: 'denylist', detail: 'blocklist unavailable' });
  }
  for (const file of input.files) {
    if (file.status === 'removed') continue;
    if (input.blocklist?.has(file.sha256) === true) {
      reasons.push({ code: 'denylist', path: file.path, detail: 'file matches a non-redistributable asset' });
    }
    if (input.visibility === 'public' && agentArtifact(file.path)) {
      reasons.push({ code: 'denylist', path: file.path, detail: 'agent artifact' });
    }
  }
  return reasons;
};
