import type { LucideIcon } from 'lucide-react';
import type { SafariRole } from '@/lib/api';

export type NavItem = {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  roles: SafariRole[];
};

/**
 * Optional colour hint for the sidebar group header. The sidebar reads
 * the value and renders the group label with a matching accent pill so
 * hierarchy reads at a glance. `undefined` falls back to the neutral
 * muted-foreground style (pre-V19.3 default).
 */
export type NavGroupTone =
  | 'blue'
  | 'green'
  | 'orange'
  | 'purple'
  | 'red'
  | 'gray';

export type NavGroup = {
  labelKey: string;
  tone?: NavGroupTone;
  items: NavItem[];
};
