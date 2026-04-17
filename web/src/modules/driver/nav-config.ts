import type { NavGroup } from '@/modules/shared/nav/nav-types';
import {
  driverFieldExpensesItem,
  myCashCustodyItem,
  myDailySalesItem,
  myDepositsItem,
  posItem,
} from '@/modules/shared/nav/nav-items';

export const driverSidebarNavGroups: NavGroup[] = [
  {
    labelKey: 'nav.groupMain',
    items: [posItem, myDepositsItem, myDailySalesItem, myCashCustodyItem],
  },
  {
    labelKey: 'nav.groupFieldCosts',
    items: [driverFieldExpensesItem],
  },
];
