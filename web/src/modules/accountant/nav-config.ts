import type { NavGroup } from '@/modules/shared/nav/nav-types';
import {
  financialReportsItem,
  knetAuditItem,
} from '@/modules/shared/nav/nav-items';

export const accountantSidebarNavGroups: NavGroup[] = [
  {
    labelKey: 'nav.groupFinance',
    items: [knetAuditItem, financialReportsItem],
  },
];
