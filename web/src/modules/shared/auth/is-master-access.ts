import type { LoginUser } from '@/lib/api';

/**
 * Full UI bypass for institutional super-users.
 * `ADMIN` is reserved for future backend roles; `OWNER` is the current master role.
 */
export function hasMasterIslandAccess(user: LoginUser | null | undefined): boolean {
  if (!user) return false;
  const r = user.safariRole as string;
  return r === 'OWNER' || r === 'GENERAL_MANAGER' || r === 'ADMIN';
}
