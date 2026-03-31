/**
 * Server-side admin detection.
 *
 * Primary check: QUIZMIND_ADMIN_EMAILS (comma-separated list of addresses).
 * Fallback check: any session that already has system roles assigned in the DB.
 *
 * Usage:
 *   import { isAdminSession } from '@/lib/admin-guard';
 *   const isAdmin = session ? isAdminSession(session) : false;
 */

function getAdminEmailSet(): Set<string> {
  const raw = process.env.QUIZMIND_ADMIN_EMAILS ?? '';
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Returns true if the email appears in the QUIZMIND_ADMIN_EMAILS allowlist. */
export function isAdminEmail(email: string): boolean {
  const set = getAdminEmailSet();
  if (set.size === 0) return false;
  return set.has(email.trim().toLowerCase());
}

/** Returns true when the session has platform system roles OR its email is allowlisted. */
export function isAdminSession(session: {
  user: { email: string };
  principal: { systemRoles: readonly string[] | string[] };
}): boolean {
  return session.principal.systemRoles.length > 0 || isAdminEmail(session.user.email);
}
