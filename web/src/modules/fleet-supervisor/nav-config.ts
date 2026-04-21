import type { NavGroup } from '@/modules/shared/nav/nav-types';
import { G } from '@/modules/shared/nav/nav-groups';
import { vehicleExpensesMineItem } from '@/modules/shared/nav/nav-items';

/**
 * V19.10 — FLEET_SUPERVISOR sidebar.
 *
 * The role owns one surface: vehicle expenses (submit + own history).
 * All reporting / approval lives with the Accountant + Owner; the
 * supervisor only needs a fast path to file a new expense with a
 * mandatory receipt photo.
 */
export const fleetSupervisorSidebarNavGroups: NavGroup[] = [
  {
    ...G.operations,
    items: [vehicleExpensesMineItem],
  },
];
