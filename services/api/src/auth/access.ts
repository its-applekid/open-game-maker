export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseEmailList(list: string | undefined): Set<string> {
  return new Set((list ?? '').split(',').map(normalizeEmail).filter(Boolean));
}
