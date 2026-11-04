export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseEmailList(list: string | undefined): Set<string> {
  return new Set((list ?? '').split(',').map(normalizeEmail).filter(Boolean));
}

export function mergeAllowedEmails(configured: ReadonlySet<string>, maintainers: ReadonlySet<string>): Set<string> {
  return new Set([...configured, ...maintainers]);
}

export function emailIsAllowed(email: string, allowedEmails: ReadonlySet<string>): boolean {
  return allowedEmails.has(normalizeEmail(email));
}
