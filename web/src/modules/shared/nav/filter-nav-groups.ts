import type { LoginUser } from '@/lib/api';
import { hasAppPermission } from '@/modules/shared/auth/app-permissions';
import type { NavGroup, NavItem } from '@/modules/shared/nav/nav-types';

/**
 * Desktop + mobile sidebars share this filter. A link is shown only when:
 * 1) the item lists the user's role, and
 * 2) ROLE_APP_PERMISSIONS for that role includes the item's permission.
 */
function canSeeNavItem(user: LoginUser | null | undefined, item: NavItem): boolean {
  if (!user) return false;
  if (!item.roles.includes(user.safariRole)) return false;
  return hasAppPermission(user, item.permission);
}

export function filterNavGroupsForUser(
  groups: NavGroup[],
  user: LoginUser | null | undefined,
): NavGroup[] {
  return groups
    .map((group) => {
      const seenRoutes = new Set<string>();
      const items = group.items.filter((item) => {
        if (!canSeeNavItem(user, item)) return false;
        if (seenRoutes.has(item.to)) return false;
        seenRoutes.add(item.to);
        return true;
      });

      return {
        ...group,
        items,
      };
    })
    .filter((group) => group.items.length > 0);
}
