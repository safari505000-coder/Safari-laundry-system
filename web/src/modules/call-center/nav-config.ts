import type { NavGroup } from '@/modules/shared/nav/nav-types';
import {
  collectionsItem,
  customersItem,
  driverMonitorItem,
  subscribersItem,
  subscriptionsItem,
  whatsappToolsItem,
} from '@/modules/shared/nav/nav-items';

export const callCenterSidebarNavGroups: NavGroup[] = [
  {
    labelKey: 'nav.groupMain',
    items: [
      customersItem,
      collectionsItem,
      subscriptionsItem,
      subscribersItem,
      whatsappToolsItem,
    ],
  },
  {
    labelKey: 'nav.groupDriverRadar',
    items: [driverMonitorItem],
  },
];
