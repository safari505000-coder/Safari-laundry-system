import type { NavGroup } from '@/modules/shared/nav/nav-types';
import {
  depositVerificationItem,
  depositsAuditItem,
  financialReportsItem,
  knetAuditItem,
} from '@/modules/shared/nav/nav-items';

export const accountantSidebarNavGroups: NavGroup[] = [
  {
    labelKey: 'nav.groupFinance',
    items: [depositsAuditItem, knetAuditItem, depositVerificationItem, financialReportsItem],
  },
];
