import type { LucideIcon } from 'lucide-react';
import type { SafariRole } from '@/lib/api';

export type NavItem = {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  roles: SafariRole[];
};

export type NavGroup = {
  labelKey: string;
  items: NavItem[];
};
