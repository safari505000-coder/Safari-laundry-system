import type { NavGroupTone } from './nav-types';

/**
 * V19.9.5 — Canonical sidebar group taxonomy.
 *
 * Every role consumes THIS set of 8 shells (labelKey + tone) and
 * decides which ones to populate with items. The point is to keep
 * the same group looking the same for every user: "Finance" is
 * always blue, "Inventory & Ops" is always orange, and the ordering
 * (Main → Customers → Invoices → Finance → Payment → Inventory →
 * Field Ops → Admin) reads identically whether you're logged in as
 * Owner, Accountant, Call-Center, or Driver.
 *
 * Role configs import this map as `G.main`, `G.finance`, etc. and
 * pick items per group. If a role has no items for a shell, the
 * sidebar automatically hides the group (the shell is simply
 * omitted from that role's config).
 */
export type CanonicalGroupKey =
  | 'main'
  | 'customersSubs'
  | 'invoices'
  | 'finance'
  | 'paymentCollection'
  | 'inventoryOps'
  | 'operations'
  | 'adminSettings';

export const CANONICAL_GROUPS: Record<
  CanonicalGroupKey,
  { labelKey: string; tone?: NavGroupTone }
> = {
  main: {
    labelKey: 'nav.groupMain',
  },
  customersSubs: {
    labelKey: 'nav.groupCustomersSubs',
    tone: 'purple',
  },
  invoices: {
    labelKey: 'nav.groupInvoices',
    tone: 'blue',
  },
  finance: {
    labelKey: 'nav.groupFinance',
    tone: 'blue',
  },
  paymentCollection: {
    labelKey: 'nav.groupPaymentCollection',
    tone: 'red',
  },
  inventoryOps: {
    labelKey: 'nav.groupInventoryOps',
    tone: 'orange',
  },
  operations: {
    labelKey: 'nav.groupOperations',
    tone: 'green',
  },
  adminSettings: {
    labelKey: 'nav.groupAdminSettings',
    tone: 'gray',
  },
};

/** Convenience alias to keep role configs compact: `G.finance`. */
export const G = CANONICAL_GROUPS;
