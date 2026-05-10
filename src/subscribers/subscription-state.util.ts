import { CustomerSubscriptionStatus, Prisma } from '@prisma/client';

/**
 * V20.3.2 — Subscriber vs Debt Separation Patch.
 *
 * Single source of truth for "is this customer currently an
 * ACTIVE subscriber?". The legacy code base mixed three signals
 * to answer that question:
 *
 *   • `CustomerWallet.subscriptionExpiresAt` (a wallet snapshot
 *     timestamp, never auto-cleared on expiry)
 *   • `CustomerWallet.subscriptionActivatedAt` (same)
 *   • `TransactionHistory` rows with type
 *     `SUBSCRIPTION_ACTIVATION` (kept forever as audit trail)
 *
 * None of those reflects the *current* lifecycle state of a
 * subscription. The canonical answer must come from the
 * `CustomerSubscription` table, with both `status === ACTIVE`
 * AND `expiresAt > now()` enforced — the schema comment at
 * `prisma/schema.prisma` line 93 explicitly defines ACTIVE as
 * "activatedAt set, expiresAt in future".
 *
 * Helpers in this file are pure (delegate-typed `db` arg) so they
 * can be called from inside transactions and from any module
 * without introducing cycles.
 */

type Db = {
  customerSubscription: Prisma.CustomerSubscriptionDelegate;
};

export type SubscriptionStateSnapshot = {
  customerId: string;
  /**
   * True iff a `CustomerSubscription` row exists for this
   * customer with `status === ACTIVE` and `expiresAt > now()`.
   * This is the answer to "should this customer be visible in
   * the Subscribers list?".
   */
  isActiveSubscriber: boolean;
  /**
   * Status of the chosen subscription row (ACTIVE row when one
   * exists, else the most recently created row, else `null`).
   * Distinct from `isActiveSubscriber` because a row can have
   * `status === ACTIVE` while `expiresAt` is already in the past
   * (lazy expiry).
   */
  subscriptionStatus: CustomerSubscriptionStatus | null;
  /**
   * Expiry timestamp of the chosen row. ISO 8601. Null when no
   * subscription row exists for this customer.
   */
  subscriptionExpiresAtIso: string | null;
  /** Activation timestamp of the chosen row. ISO 8601 or null. */
  subscriptionActivatedAtIso: string | null;
  /** Plan name snapshot of the chosen row. Null when none. */
  planNameSnapshot: string | null;
};

/**
 * V20.3.2 — Phase 38 strict subscriber membership flag.
 *
 * When `STRICT_SUBSCRIBER_MEMBERSHIP=true` (the post-V20.3.2
 * default — see {@link isStrictSubscriberMembershipEnabled}), the
 * Subscribers list returns ONLY customers with an
 * `isActiveSubscriber === true` snapshot. When OFF, the legacy
 * "ever-had-a-subscription-history-row" membership is preserved
 * for back-compat (operators who still rely on the wider list can
 * opt-out by setting the env to `false`/`0`).
 *
 * Re-read on every call so operators can flip without a restart.
 *
 * Default: ON. The env must be explicitly set to a falsy value to
 * disable the strict filter.
 */
export function isStrictSubscriberMembershipEnabled(): boolean {
  const v = (process.env.STRICT_SUBSCRIBER_MEMBERSHIP ?? '')
    .toString()
    .trim()
    .toLowerCase();
  if (v === '') return true; // unset → strict (V20.3.2 default)
  return !(v === 'false' || v === '0' || v === 'off' || v === 'no');
}

/**
 * V20.3.2 — canonical "is this customer an active subscriber?".
 *
 * Returns true iff a `CustomerSubscription` row exists with
 * `status === ACTIVE` and `expiresAt > now()`. Returns false for
 * every other case (no row, expired, cancelled, rolled-over,
 * cut-off, lazy-expiry rows whose status hasn't been flipped).
 *
 * Uses `findFirst` with a `take: 1` style query so the call is
 * O(log N) on the indexed (customerId, status) tuple.
 */
export async function isCustomerActiveSubscriber(
  db: Db,
  customerId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const row = await db.customerSubscription.findFirst({
    where: {
      customerId,
      status: CustomerSubscriptionStatus.ACTIVE,
      expiresAt: { gt: now },
    },
    select: { id: true },
  });
  // Prisma returns null on miss; we use loose null check so the
  // helper is also safe against test doubles that return undefined.
  return row != null;
}

/**
 * V20.3.2 — batch version of {@link isCustomerActiveSubscriber}.
 *
 * Returns the set of customer IDs that are *currently* active
 * subscribers. Used by Subscribers list / KPIs to filter a page
 * of candidates in a single SQL pass.
 *
 * Empty input → empty set (no DB call).
 */
export async function getActiveCustomerSubscriberIds(
  db: Db,
  customerIds: string[],
  now: Date = new Date(),
): Promise<Set<string>> {
  const out = new Set<string>();
  if (customerIds.length === 0) return out;
  const rows = await db.customerSubscription.findMany({
    where: {
      customerId: { in: customerIds },
      status: CustomerSubscriptionStatus.ACTIVE,
      expiresAt: { gt: now },
    },
    select: { customerId: true },
  });
  for (const r of rows) out.add(r.customerId);
  return out;
}

/**
 * V20.3.2 — full per-customer subscription snapshot.
 *
 * Loads every subscription row for the customer and reduces them
 * to a single canonical answer:
 *   • `isActiveSubscriber`: an ACTIVE row with `expiresAt > now`
 *     exists.
 *   • `subscriptionStatus`: status of the chosen row. Picks an
 *     ACTIVE row first (newest by `expiresAt`), else the newest
 *     row by `createdAt`.
 *   • `subscriptionExpiresAtIso` / `subscriptionActivatedAtIso`:
 *     timestamps from the chosen row.
 *
 * Use this when you need both the boolean AND the auxiliary
 * fields for an API response.
 */
export async function getCustomerSubscriptionState(
  db: Db,
  customerId: string,
  now: Date = new Date(),
): Promise<SubscriptionStateSnapshot> {
  const rows = await db.customerSubscription.findMany({
    where: { customerId },
    orderBy: [{ expiresAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      status: true,
      activatedAt: true,
      expiresAt: true,
      createdAt: true,
      planNameSnapshot: true,
    },
  });
  if (rows.length === 0) {
    return {
      customerId,
      isActiveSubscriber: false,
      subscriptionStatus: null,
      subscriptionExpiresAtIso: null,
      subscriptionActivatedAtIso: null,
      planNameSnapshot: null,
    };
  }
  // Prefer the row that is currently ACTIVE + still in window; else
  // the most recently expiring row. orderBy above is descending so
  // the first ACTIVE+future row is the canonical "current" one.
  const activeRow =
    rows.find(
      (r) =>
        r.status === CustomerSubscriptionStatus.ACTIVE &&
        r.expiresAt.getTime() > now.getTime(),
    ) ?? rows[0];
  const isActive =
    activeRow.status === CustomerSubscriptionStatus.ACTIVE &&
    activeRow.expiresAt.getTime() > now.getTime();
  return {
    customerId,
    isActiveSubscriber: isActive,
    subscriptionStatus: activeRow.status,
    subscriptionExpiresAtIso: activeRow.expiresAt.toISOString(),
    subscriptionActivatedAtIso: activeRow.activatedAt?.toISOString() ?? null,
    planNameSnapshot: activeRow.planNameSnapshot ?? null,
  };
}

/**
 * V20.3.2 — batch snapshot variant. Returns a Map keyed by
 * customerId. Reuses the same single-row reducer logic as
 * {@link getCustomerSubscriptionState}.
 */
export async function getCustomerSubscriptionStateBatch(
  db: Db,
  customerIds: string[],
  now: Date = new Date(),
): Promise<Map<string, SubscriptionStateSnapshot>> {
  const out = new Map<string, SubscriptionStateSnapshot>();
  if (customerIds.length === 0) return out;
  const rows = await db.customerSubscription.findMany({
    where: { customerId: { in: customerIds } },
    orderBy: [{ expiresAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      customerId: true,
      status: true,
      activatedAt: true,
      expiresAt: true,
      createdAt: true,
      planNameSnapshot: true,
    },
  });
  const byCustomer = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byCustomer.get(r.customerId) ?? ([] as typeof rows);
    list.push(r);
    byCustomer.set(r.customerId, list);
  }
  for (const customerId of customerIds) {
    const list = byCustomer.get(customerId) ?? [];
    if (list.length === 0) {
      out.set(customerId, {
        customerId,
        isActiveSubscriber: false,
        subscriptionStatus: null,
        subscriptionExpiresAtIso: null,
        subscriptionActivatedAtIso: null,
        planNameSnapshot: null,
      });
      continue;
    }
    const activeRow =
      list.find(
        (r) =>
          r.status === CustomerSubscriptionStatus.ACTIVE &&
          r.expiresAt.getTime() > now.getTime(),
      ) ?? list[0];
    const isActive =
      activeRow.status === CustomerSubscriptionStatus.ACTIVE &&
      activeRow.expiresAt.getTime() > now.getTime();
    out.set(customerId, {
      customerId,
      isActiveSubscriber: isActive,
      subscriptionStatus: activeRow.status,
      subscriptionExpiresAtIso: activeRow.expiresAt.toISOString(),
      subscriptionActivatedAtIso: activeRow.activatedAt?.toISOString() ?? null,
      planNameSnapshot: activeRow.planNameSnapshot ?? null,
    });
  }
  return out;
}
