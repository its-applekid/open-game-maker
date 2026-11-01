export function parseRepository(value: string): { owner: string; name: string } {
  const match = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]+)$/u.exec(value);
  if (match?.[1] === undefined || match[2] === undefined || match[2] === '.' || match[2] === '..') {
    throw new Error('OGM_PLATFORM_ISSUE_REPO must be an owner/repository name');
  }
  return { owner: match[1], name: match[2] };
}
