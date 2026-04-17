import type { NavGroup } from '@/modules/shared/nav/nav-types';
import {
  collectDriverCashItem,
  dashboardItem,
  expensesItem,
  financialsItem,
  ordersItem,
  posItem,
  shiftsItem,
} from '@/modules/shared/nav/nav-items';

export const managerSidebarNavGroups: NavGroup[] = [
  {
    labelKey: 'nav.groupMain',
    items: [posItem, dashboardItem, ordersItem],
  },
  { labelKey: 'nav.groupOperations', items: [shiftsItem] },
  {
    labelKey: 'nav.groupFinance',
    items: [financialsItem, expensesItem, collectDriverCashItem],
  },
];
