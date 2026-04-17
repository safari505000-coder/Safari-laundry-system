import type { NavGroup } from '@/modules/shared/nav/nav-types';
import {
  collectionsItem,
  customersItem,
  whatsappToolsItem,
} from '@/modules/shared/nav/nav-items';

export const callCenterSidebarNavGroups: NavGroup[] = [
  {
    labelKey: 'nav.groupMain',
    items: [customersItem, collectionsItem, whatsappToolsItem],
  },
];
