import type { AssetsLock } from '@ogm/contracts';

function collectionOf(id: string): string {
  return id
    .replace(/^t[123]:/, '')
    .split('/')[0]!
    .replace(/@.*$/, '');
}

export function renderCredits(lock: AssetsLock): string {
  const groups = new Map<string, { attributions: Set<string>; collections: Set<string> }>();
  for (const entry of lock.assets) {
    const group = groups.get(entry.license) ?? { attributions: new Set<string>(), collections: new Set<string>() };
    if (entry.rights.attribution !== null) group.attributions.add(entry.rights.attribution);
    group.collections.add(collectionOf(entry.id));
    groups.set(entry.license, group);
  }

  const sections: string[] = [];
  for (const [license, group] of [...groups].sort(([left], [right]) => left.localeCompare(right))) {
    const lines = [...group.attributions].sort().map((attribution) => `- ${attribution}`);
    if (license === 'CC0-1.0') {
      lines.unshift(`- CC0 assets from: ${[...group.collections].sort().join(', ')}`);
    }
    sections.push(`## ${license}${lines.length === 0 ? '' : `\n${lines.join('\n')}`}`);
  }
  return `# Credits\n${sections.length === 0 ? '' : `\n${sections.join('\n\n')}\n`}`;
}
