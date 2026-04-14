/** Canonical permission keys — institutional RBAC; keep in sync with seed. */
export const ALL_PERMISSION_KEYS = [
  'user:read',
  'user:create',
  'user:update',
  'user:delete',
  'role:read',
  'role:manage',
  'permission:read',
  'permission:grant',
  'permission:revoke',
  'branch:read',
  'branch:create',
  'branch:update',
  'branch:delete',
  'wallet:read',
  'wallet:create',
  'wallet:update',
  'wallet:delete',
  'audit:read',
  'report:read',
  'customer:read',
  'customer:search',
  'subscription:activate',
  'subscription-plan:read',
  'subscription-plan:create',
  'subscription-plan:update',
  'subscription-plan:delete',
] as const;

/** MANAGER — operational access including management reports (not DRIVER). */
export const MANAGER_PERMISSION_KEYS: readonly string[] = [
  'user:read',
  'branch:read',
  'wallet:read',
  'audit:read',
  'permission:read',
  'report:read',
];

/** DRIVER — service delivery; excludes management reporting surfaces. */
export const DRIVER_PERMISSION_KEYS: readonly string[] = [
  'branch:read',
  'wallet:read',
];

/** CALL_CENTER — customer lookup and subscription activation only. */
export const CALL_CENTER_PERMISSION_KEYS: readonly string[] = [
  'customer:read',
  'customer:search',
  'subscription:activate',
];

/** ACCOUNTANT — finance-oriented read access (محاسب). */
export const ACCOUNTANT_PERMISSION_KEYS: readonly string[] = [
  'branch:read',
  'wallet:read',
  'report:read',
  'customer:read',
  'customer:search',
];

/** SUPERVISOR — same operational surface as manager for oversight (مراقب). */
export const SUPERVISOR_PERMISSION_KEYS: readonly string[] = [
  ...MANAGER_PERMISSION_KEYS,
];

/** VIEWER — read-only dashboards & lookups (no write operations). */
export const VIEWER_PERMISSION_KEYS: readonly string[] = [
  ...ACCOUNTANT_PERMISSION_KEYS,
];
