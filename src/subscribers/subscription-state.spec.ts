import { CustomerSubscriptionStatus } from '@prisma/client';
import {
  getActiveCustomerSubscriberIds,
  getCustomerSubscriptionState,
  getCustomerSubscriptionStateBatch,
  isCustomerActiveSubscriber,
  isStrictSubscriberMembershipEnabled,
} from './subscription-state.util';

/**
 * V20.3.2 — Subscriber-vs-Debt-Separation spec.
 *
 * Covers the 5 required cases from the V20.3.2 prompt:
 *
 *   CASE 1 — partial-paid invoice, no subscription → NOT a subscriber
 *   CASE 2 — active subscription, no debt → subscriber
 *   CASE 3 — active subscription with debt → both dimensions
 *   CASE 4 — expired subscription with debt → NOT a subscriber
 *   CASE 5 — subscriber KPI counts only currently-active rows
 *
 * The spec exercises the canonical helpers in
 * `subscription-state.util.ts` plus the strict-membership flag,
 * which together are the single source of truth that
 * SubscribersService / Outstanding / DebtService all consume.
 */

type SubRow = {
  customerId: string;
  status: CustomerSubscriptionStatus;
  activatedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  planNameSnapshot: string | null;
};

function makeDb(rows: SubRow[]) {
  const sortRows = (a: SubRow, b: SubRow) => {
    const expDiff = b.expiresAt.getTime() - a.expiresAt.getTime();
    if (expDiff !== 0) return expDiff;
    return b.createdAt.getTime() - a.createdAt.getTime();
  };
  function customerIdMatches(row: SubRow, whereCustomerId: any): boolean {
    if (whereCustomerId == null) return true;
    if (typeof whereCustomerId === 'string') {
      return row.customerId === whereCustomerId;
    }
    if (Array.isArray(whereCustomerId?.in)) {
      return whereCustomerId.in.includes(row.customerId);
    }
    return true;
  }
  return {
    customerSubscription: {
      findFirst: jest.fn(async ({ where }: any) => {
        const list = rows.filter((r) => {
          if (!customerIdMatches(r, where?.customerId)) return false;
          if (where?.status && r.status !== where.status) return false;
          if (where?.expiresAt?.gt && r.expiresAt <= where.expiresAt.gt) {
            return false;
          }
          return true;
        });
        list.sort(sortRows);
        return list[0] ? { id: 'sub-row', ...list[0] } : null;
      }),
      findMany: jest.fn(async ({ where }: any) => {
        const list = rows.filter((r) => {
          if (!customerIdMatches(r, where?.customerId)) return false;
          if (where?.status && r.status !== where.status) return false;
          if (where?.expiresAt?.gt && r.expiresAt <= where.expiresAt.gt) {
            return false;
          }
          return true;
        });
        list.sort(sortRows);
        return list.map((r) => ({ id: 'sub-row', ...r }));
      }),
    },
  } as any;
}

const NOW = new Date('2026-05-07T00:00:00.000Z');
const FUTURE = new Date('2026-12-01T00:00:00.000Z');
const PAST = new Date('2026-02-01T00:00:00.000Z');
const C_PARTIAL = '11111111-1111-4111-8111-111111111111';
const C_ACTIVE_NO_DEBT = '22222222-2222-4222-8222-222222222222';
const C_ACTIVE_WITH_DEBT = '33333333-3333-4333-8333-333333333333';
const C_EXPIRED = '44444444-4444-4444-8444-444444444444';
const C_CANCELLED = '55555555-5555-4555-8555-555555555555';

function activeRow(customerId: string): SubRow {
  return {
    customerId,
    status: CustomerSubscriptionStatus.ACTIVE,
    activatedAt: PAST,
    expiresAt: FUTURE,
    createdAt: PAST,
    planNameSnapshot: 'Standard',
  };
}

function expiredButActiveStatusRow(customerId: string): SubRow {
  // Lazy expiry — status was never flipped from ACTIVE even
  // though the calendar window has closed.
  return {
    customerId,
    status: CustomerSubscriptionStatus.ACTIVE,
    activatedAt: PAST,
    expiresAt: PAST,
    createdAt: PAST,
    planNameSnapshot: 'Standard (lazy expired)',
  };
}

function cancelledRow(customerId: string): SubRow {
  return {
    customerId,
    status: CustomerSubscriptionStatus.CANCELLED,
    activatedAt: PAST,
    expiresAt: FUTURE,
    createdAt: PAST,
    planNameSnapshot: 'Standard',
  };
}

describe('V20.3.2 — subscriber vs debt separation', () => {
  describe('isCustomerActiveSubscriber', () => {
    it('CASE 1 — customer with NO subscription row → false', async () => {
      const db = makeDb([]);
      expect(await isCustomerActiveSubscriber(db, C_PARTIAL, NOW)).toBe(false);
    });

    it('CASE 2 — ACTIVE row + future expiry → true', async () => {
      const db = makeDb([activeRow(C_ACTIVE_NO_DEBT)]);
      expect(
        await isCustomerActiveSubscriber(db, C_ACTIVE_NO_DEBT, NOW),
      ).toBe(true);
    });

    it('CASE 3 — ACTIVE row + future expiry → true even when customer has debt', async () => {
      const db = makeDb([activeRow(C_ACTIVE_WITH_DEBT)]);
      // Note: this helper does NOT consult debt at all. The caller
      // composes "isSubscriber" and "hasDebt" as independent flags.
      expect(
        await isCustomerActiveSubscriber(db, C_ACTIVE_WITH_DEBT, NOW),
      ).toBe(true);
    });

    it('CASE 4 — ACTIVE-status row but expiresAt in the past → false (lazy expiry)', async () => {
      const db = makeDb([expiredButActiveStatusRow(C_EXPIRED)]);
      expect(await isCustomerActiveSubscriber(db, C_EXPIRED, NOW)).toBe(false);
    });

    it('CANCELLED row with future expiresAt → false', async () => {
      const db = makeDb([cancelledRow(C_CANCELLED)]);
      expect(
        await isCustomerActiveSubscriber(db, C_CANCELLED, NOW),
      ).toBe(false);
    });
  });

  describe('getActiveCustomerSubscriberIds (batch)', () => {
    it('CASE 5 — KPI returns only customers with active+future rows', async () => {
      const db = makeDb([
        activeRow(C_ACTIVE_NO_DEBT),
        activeRow(C_ACTIVE_WITH_DEBT),
        expiredButActiveStatusRow(C_EXPIRED),
        cancelledRow(C_CANCELLED),
      ]);
      const ids = await getActiveCustomerSubscriberIds(
        db,
        [
          C_PARTIAL,
          C_ACTIVE_NO_DEBT,
          C_ACTIVE_WITH_DEBT,
          C_EXPIRED,
          C_CANCELLED,
        ],
        NOW,
      );
      expect(ids.has(C_PARTIAL)).toBe(false);
      expect(ids.has(C_ACTIVE_NO_DEBT)).toBe(true);
      expect(ids.has(C_ACTIVE_WITH_DEBT)).toBe(true);
      expect(ids.has(C_EXPIRED)).toBe(false);
      expect(ids.has(C_CANCELLED)).toBe(false);
      expect(ids.size).toBe(2);
    });

    it('empty input → empty set, no DB call', async () => {
      const db = makeDb([]);
      const ids = await getActiveCustomerSubscriberIds(db, [], NOW);
      expect(ids.size).toBe(0);
      expect(db.customerSubscription.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getCustomerSubscriptionState', () => {
    it('returns full snapshot for an active subscriber', async () => {
      const db = makeDb([activeRow(C_ACTIVE_NO_DEBT)]);
      const snap = await getCustomerSubscriptionState(
        db,
        C_ACTIVE_NO_DEBT,
        NOW,
      );
      expect(snap.isActiveSubscriber).toBe(true);
      expect(snap.subscriptionStatus).toBe(
        CustomerSubscriptionStatus.ACTIVE,
      );
      expect(snap.subscriptionExpiresAtIso).toBe(FUTURE.toISOString());
      expect(snap.planNameSnapshot).toBe('Standard');
    });

    it('returns isActive=false for lazy-expired ACTIVE rows', async () => {
      const db = makeDb([expiredButActiveStatusRow(C_EXPIRED)]);
      const snap = await getCustomerSubscriptionState(db, C_EXPIRED, NOW);
      // Status field still reports ACTIVE — that's the row truth.
      // But the canonical "isActiveSubscriber" boolean is false.
      expect(snap.isActiveSubscriber).toBe(false);
      expect(snap.subscriptionStatus).toBe(
        CustomerSubscriptionStatus.ACTIVE,
      );
      expect(snap.subscriptionExpiresAtIso).toBe(PAST.toISOString());
    });

    it('returns null fields for customer with NO subscription row', async () => {
      const db = makeDb([]);
      const snap = await getCustomerSubscriptionState(db, C_PARTIAL, NOW);
      expect(snap.isActiveSubscriber).toBe(false);
      expect(snap.subscriptionStatus).toBeNull();
      expect(snap.subscriptionExpiresAtIso).toBeNull();
      expect(snap.subscriptionActivatedAtIso).toBeNull();
      expect(snap.planNameSnapshot).toBeNull();
    });

    it('prefers active+future row over older expired row', async () => {
      const db = makeDb([
        // Older expired row in history.
        {
          customerId: C_ACTIVE_NO_DEBT,
          status: CustomerSubscriptionStatus.EXPIRED,
          activatedAt: new Date('2025-01-01T00:00:00Z'),
          expiresAt: new Date('2025-02-01T00:00:00Z'),
          createdAt: new Date('2025-01-01T00:00:00Z'),
          planNameSnapshot: 'Old plan',
        },
        // Newer ACTIVE row that should win.
        activeRow(C_ACTIVE_NO_DEBT),
      ]);
      const snap = await getCustomerSubscriptionState(
        db,
        C_ACTIVE_NO_DEBT,
        NOW,
      );
      expect(snap.isActiveSubscriber).toBe(true);
      expect(snap.subscriptionExpiresAtIso).toBe(FUTURE.toISOString());
      expect(snap.planNameSnapshot).toBe('Standard');
    });
  });

  describe('getCustomerSubscriptionStateBatch', () => {
    it('returns one snapshot per requested id, including misses', async () => {
      const db = makeDb([
        activeRow(C_ACTIVE_NO_DEBT),
        expiredButActiveStatusRow(C_EXPIRED),
      ]);
      const map = await getCustomerSubscriptionStateBatch(
        db,
        [C_PARTIAL, C_ACTIVE_NO_DEBT, C_EXPIRED],
        NOW,
      );
      expect(map.size).toBe(3);
      expect(map.get(C_PARTIAL)?.isActiveSubscriber).toBe(false);
      expect(map.get(C_ACTIVE_NO_DEBT)?.isActiveSubscriber).toBe(true);
      expect(map.get(C_EXPIRED)?.isActiveSubscriber).toBe(false);
      // One DB roundtrip regardless of customer count.
      expect(db.customerSubscription.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('isStrictSubscriberMembershipEnabled (env flag)', () => {
    let prev: string | undefined;
    beforeEach(() => {
      prev = process.env.STRICT_SUBSCRIBER_MEMBERSHIP;
    });
    afterEach(() => {
      if (prev === undefined) {
        delete process.env.STRICT_SUBSCRIBER_MEMBERSHIP;
      } else {
        process.env.STRICT_SUBSCRIBER_MEMBERSHIP = prev;
      }
    });

    it('defaults to true (V20.3.2 strict membership) when env is unset', () => {
      delete process.env.STRICT_SUBSCRIBER_MEMBERSHIP;
      expect(isStrictSubscriberMembershipEnabled()).toBe(true);
    });

    it('returns false only when env is explicitly false/0/off/no', () => {
      for (const v of ['false', '0', 'off', 'no', 'FALSE']) {
        process.env.STRICT_SUBSCRIBER_MEMBERSHIP = v;
        expect(isStrictSubscriberMembershipEnabled()).toBe(false);
      }
    });

    it('returns true for any other value (true/1/yes/on/garbage)', () => {
      for (const v of ['true', '1', 'on', 'yes', 'maybe', '   ']) {
        process.env.STRICT_SUBSCRIBER_MEMBERSHIP = v;
        expect(isStrictSubscriberMembershipEnabled()).toBe(true);
      }
    });
  });
});
