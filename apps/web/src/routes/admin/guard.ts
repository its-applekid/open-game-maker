export type AdminRoleSource = { platformRole: 'maintainer' | 'admin' | 'none' };

export function requireAdmin(session: AdminRoleSource | null): 'ok' | 'redirect' {
  return session && (session.platformRole === 'admin' || session.platformRole === 'maintainer') ? 'ok' : 'redirect';
}
