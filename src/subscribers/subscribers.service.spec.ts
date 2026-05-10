import {
  CashStatus,
  CustomerSubscriptionStatus,
  LedgerTransactionType,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { SubscribersService } from './subscribers.service';

/**
 * V20.3.2 — strict-membership integration spec for
 * `SubscribersService.list`.
 *
 * Covers the bug from the V20.3.2 prompt:
 *   "Customer with partial-paid invoice and NO active
 *    subscription MUST NOT appear in Subscribers."
 *
 * Builds an in-memory Prisma + Orders mock that reproduces the
 * historical "ever had a subscription history row" candidate
 * set, then verifies that the V20.3.2 strict filter restricts
 * the response to customers with a currently-active
 * `CustomerSubscription` (status === ACTIVE AND expiresAt > now).
 */

const NOW = new Date();
const FUTURE = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
const PAST = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000);

const C_DEBT_ONLY = '11111111-1111-4111-8111-111111111111';
const C_ACTIVE_NO_DEBT = '22222222-2222-4222-8222-222222222222';
const C_ACTIVE_WITH_DEBT = '33333333-3333-4333-8333-333333333333';
const C_EXPIRED = '44444444-4444-4444-8444-444444444444';

type Wallet = {
  balance: Prisma.Decimal;
  debt: Prisma.Decimal;
  subscriptionPlanId: string | null;
  subscriptionPlanName: string | null;
  subscriptionActivatedAt: Date | null;
  subscriptionExpiresAt: Date | null;
  subscriptionLastReminderAt: Date | null;
  subscriptionReminderCount: number;
};

type CustomerRow = {
  id: string;
  phone: string;
  displayName: string;
  wallet: Wallet | null;
  transactionHistory: Array<{
    createdAt: Date;
    metadata: Record<string, unknown> | null;
  }>;
};

type SubRow = {
  customerId: string;
  status: CustomerSubscriptionStatus;
  activatedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  planNameSnapshot: string | null;
};

const D = (v: string | number) => new Prisma.Decimal(v.toString());

function wallet(opts?: Partial<Wallet>): Wallet {
  return {
    balance: D('0'),
    debt: D('0'),
    subscriptionPlanId: null,
    subscriptionPlanName: null,
    subscriptionActivatedAt: null,
    subscriptionExpiresAt: null,
    subscriptionLastReminderAt: null,
    subscriptionReminderCount: 0,
    ...opts,
  };
}

/**
 * V20.3.2 (UI-drift patch) — minimal `Order` row used by the
 * canonical debt helper. We expose only the columns the helper
 * inspects so the fixture stays focused on the membership /
 * debt assertions.
 */
type OrderFixtureRow = {
  id: string;
  customerId: string;
  totalPrice: Prisma.Decimal;
  status: OrderStatus;
  cashStatus: CashStatus;
  posPaymentMethod: 'DEBT_ON_ACCOUNT' | null;
};

function makePrisma(opts: {
  customers: CustomerRow[];
  subscriptions: SubRow[];
  /**
   * V20.3.2 UI-drift patch: orders feed
   * `computeCanonicalCustomerDebt` (the new source of
   * `remainingDebtKd`). Pass empty / omit when the test only
   * cares about subscription state.
   */
  orders?: OrderFixtureRow[];
}) {
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
    customer: {
      findMany: jest.fn(async () => opts.customers),
    },
    customerSubscription: {
      findFirst: jest.fn(async ({ where }: any) => {
        const list = opts.subscriptions.filter((r) => {
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
        const list = opts.subscriptions.filter((r) => {
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
    order: {
      findMany: jest.fn(async ({ where }: any = {}) => {
        let list = [...(opts.orders ?? [])];
        if (where?.id?.in) {
          const ids: string[] = where.id.in;
          list = list.filter((o) => ids.includes(o.id));
        }
        if (where?.customerId) {
          list = list.filter((o) => o.customerId === where.customerId);
        }
        if (where?.status?.not) {
          list = list.filter((o) => o.status !== where.status.not);
        }
        if (where?.OR) {
          list = list.filter(
            (o) =>
              o.cashStatus === CashStatus.UNPAID ||
              o.posPaymentMethod === 'DEBT_ON_ACCOUNT',
          );
        }
        return list;
      }),
    },
    debtLedgerEntry: {
      // Canonical helper consults DebtLedgerEntry to subtract
      // payments / wallet absorption. The strict-membership spec
      // only needs the gross side, so empty is fine.
      findMany: jest.fn().mockResolvedValue([]),
    },
    subscriptionPlan: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as any;
}

/**
 * V20.3.2 UI-drift patch — minimal JournalSourceService stub.
 * The strict-membership spec asserts on the V20.3.1 partial-
 * payment sum branch (V20_3_TRUE_ACCOUNTING is OFF), so journal
 * AR is informational only — return zero.
 */
function makeJournalSource() {
  return {
    getCustomerDebtFromJournalAR: jest
      .fn()
      .mockResolvedValue(new Prisma.Decimal(0)),
  } as any;
}

function makeOrders(debtBreakdown: Map<string, {
  walletDebtKd: Prisma.Decimal;
  collectionsReceivableKd: Prisma.Decimal;
  operationalDebtKd: Prisma.Decimal;
  collectionsOpenOrderIds: Set<string>;
}>) {
  return {
    getOperationalDebtKdBreakdown: jest.fn(
      async (customerId: string) =>
        debtBreakdown.get(customerId) ?? {
          walletDebtKd: D('0'),
          collectionsReceivableKd: D('0'),
          operationalDebtKd: D('0'),
          collectionsOpenOrderIds: new Set<string>(),
        },
    ),
  } as any;
}

describe('SubscribersService.list — V20.3.2 strict membership', () => {
  let prevFlag: string | undefined;
  beforeEach(() => {
    prevFlag = process.env.STRICT_SUBSCRIBER_MEMBERSHIP;
  });
  afterEach(() => {
    if (prevFlag === undefined) {
      delete process.env.STRICT_SUBSCRIBER_MEMBERSHIP;
    } else {
      process.env.STRICT_SUBSCRIBER_MEMBERSHIP = prevFlag;
    }
  });

  /**
   * Builds the canonical 4-customer fixture used by the rest of
   * the spec:
   *   - C_DEBT_ONLY: had a SUBSCRIPTION_ACTIVATION row years
   *     ago, no current CustomerSubscription, OWES money.
   *   - C_ACTIVE_NO_DEBT: ACTIVE CustomerSubscription, no debt.
   *   - C_ACTIVE_WITH_DEBT: ACTIVE CustomerSubscription, OWES.
   *   - C_EXPIRED: had ACTIVE CustomerSubscription that lazily
   *     expired (status=ACTIVE, expiresAt in the past), OWES.
   */
  function buildFixture() {
    const customers: CustomerRow[] = [
      {
        id: C_DEBT_ONLY,
        phone: '+96550000001',
        displayName: 'Partial-paid customer',
        wallet: wallet({ debt: D('70') }),
        transactionHistory: [
          { createdAt: PAST, metadata: { planName: 'Old plan' } },
        ],
      },
      {
        id: C_ACTIVE_NO_DEBT,
        phone: '+96550000002',
        displayName: 'Active subscriber',
        wallet: wallet({
          subscriptionActivatedAt: PAST,
          subscriptionExpiresAt: FUTURE,
        }),
        transactionHistory: [
          { createdAt: PAST, metadata: { planName: 'Standard' } },
        ],
      },
      {
        id: C_ACTIVE_WITH_DEBT,
        phone: '+96550000003',
        displayName: 'Active subscriber + debt',
        wallet: wallet({
          debt: D('10'),
          subscriptionActivatedAt: PAST,
          subscriptionExpiresAt: FUTURE,
        }),
        transactionHistory: [
          { createdAt: PAST, metadata: { planName: 'Standard' } },
        ],
      },
      {
        id: C_EXPIRED,
        phone: '+96550000004',
        displayName: 'Expired subscriber + debt',
        wallet: wallet({
          debt: D('25'),
          subscriptionActivatedAt: PAST,
          subscriptionExpiresAt: PAST,
        }),
        transactionHistory: [
          { createdAt: PAST, metadata: { planName: 'Old plan' } },
        ],
      },
    ];

    const subscriptions: SubRow[] = [
      {
        customerId: C_ACTIVE_NO_DEBT,
        status: CustomerSubscriptionStatus.ACTIVE,
        activatedAt: PAST,
        expiresAt: FUTURE,
        createdAt: PAST,
        planNameSnapshot: 'Standard',
      },
      {
        customerId: C_ACTIVE_WITH_DEBT,
        status: CustomerSubscriptionStatus.ACTIVE,
        activatedAt: PAST,
        expiresAt: FUTURE,
        createdAt: PAST,
        planNameSnapshot: 'Standard',
      },
      // Lazy-expired ACTIVE row — status flag never flipped but
      // expiresAt is in the past.
      {
        customerId: C_EXPIRED,
        status: CustomerSubscriptionStatus.ACTIVE,
        activatedAt: PAST,
        expiresAt: PAST,
        createdAt: PAST,
        planNameSnapshot: 'Old plan',
      },
    ];

    const debtBreakdown = new Map<
      string,
      Awaited<ReturnType<ReturnType<typeof makeOrders>['getOperationalDebtKdBreakdown']>>
    >([
      [
        C_DEBT_ONLY,
        {
          walletDebtKd: D('70'),
          collectionsReceivableKd: D('70'),
          operationalDebtKd: D('70'),
          collectionsOpenOrderIds: new Set<string>(),
        },
      ],
      [
        C_ACTIVE_NO_DEBT,
        {
          walletDebtKd: D('0'),
          collectionsReceivableKd: D('0'),
          operationalDebtKd: D('0'),
          collectionsOpenOrderIds: new Set<string>(),
        },
      ],
      [
        C_ACTIVE_WITH_DEBT,
        {
          walletDebtKd: D('10'),
          collectionsReceivableKd: D('10'),
          operationalDebtKd: D('10'),
          collectionsOpenOrderIds: new Set<string>(),
        },
      ],
      [
        C_EXPIRED,
        {
          walletDebtKd: D('25'),
          collectionsReceivableKd: D('25'),
          operationalDebtKd: D('25'),
          collectionsOpenOrderIds: new Set<string>(),
        },
      ],
    ]);

    /**
     * V20.3.2 UI-drift patch — orders that back the canonical
     * remaining-debt helper. Each customer with operational
     * debt gets a single UNPAID `DEBT_ON_ACCOUNT` order with
     * `totalPrice` matching their `walletDebtKd` so the canonical
     * helper reproduces the legacy figure (no real payments
     * recorded).
     */
    const orders: OrderFixtureRow[] = [
      {
        id: 'o-debt-only',
        customerId: C_DEBT_ONLY,
        totalPrice: D('70'),
        status: OrderStatus.COMPLETED,
        cashStatus: CashStatus.UNPAID,
        posPaymentMethod: 'DEBT_ON_ACCOUNT',
      },
      {
        id: 'o-active-with-debt',
        customerId: C_ACTIVE_WITH_DEBT,
        totalPrice: D('10'),
        status: OrderStatus.COMPLETED,
        cashStatus: CashStatus.UNPAID,
        posPaymentMethod: 'DEBT_ON_ACCOUNT',
      },
      {
        id: 'o-expired',
        customerId: C_EXPIRED,
        totalPrice: D('25'),
        status: OrderStatus.COMPLETED,
        cashStatus: CashStatus.UNPAID,
        posPaymentMethod: 'DEBT_ON_ACCOUNT',
      },
    ];

    return { customers, subscriptions, debtBreakdown, orders };
  }

  it('CASE 1 — partial-paid customer with NO active subscription is hidden', async () => {
    process.env.STRICT_SUBSCRIBER_MEMBERSHIP = 'true';
    const { customers, subscriptions, debtBreakdown, orders: orderFixtures } = buildFixture();
    const prisma = makePrisma({ customers, subscriptions, orders: orderFixtures });
    const orders = makeOrders(debtBreakdown);
    const svc = new SubscribersService(prisma, orders, makeJournalSource());

    const rows = await svc.list();

    const ids = rows.map((r) => r.customerId);
    expect(ids).toContain(C_ACTIVE_NO_DEBT);
    expect(ids).toContain(C_ACTIVE_WITH_DEBT);
    expect(ids).not.toContain(C_DEBT_ONLY);
    expect(ids).not.toContain(C_EXPIRED);
  });

  it('CASE 2 — active subscriber with no debt → present, isActiveSubscriber=true, hasDebt=false', async () => {
    process.env.STRICT_SUBSCRIBER_MEMBERSHIP = 'true';
    const { customers, subscriptions, debtBreakdown, orders: orderFixtures } = buildFixture();
    const prisma = makePrisma({ customers, subscriptions, orders: orderFixtures });
    const orders = makeOrders(debtBreakdown);
    const svc = new SubscribersService(prisma, orders, makeJournalSource());

    const rows = await svc.list();
    const row = rows.find((r) => r.customerId === C_ACTIVE_NO_DEBT)!;
    expect(row).toBeDefined();
    expect(row.isActiveSubscriber).toBe(true);
    expect(row.hasDebt).toBe(false);
    expect(row.subscriptionStatus).toBe(CustomerSubscriptionStatus.ACTIVE);
    expect(row.remainingDebtKd).toBe('0.0000');
  });

  it('CASE 3 — active subscriber WITH debt → in subscribers AND has hasDebt=true', async () => {
    process.env.STRICT_SUBSCRIBER_MEMBERSHIP = 'true';
    const { customers, subscriptions, debtBreakdown, orders: orderFixtures } = buildFixture();
    const prisma = makePrisma({ customers, subscriptions, orders: orderFixtures });
    const orders = makeOrders(debtBreakdown);
    const svc = new SubscribersService(prisma, orders, makeJournalSource());

    const rows = await svc.list();
    const row = rows.find((r) => r.customerId === C_ACTIVE_WITH_DEBT)!;
    expect(row).toBeDefined();
    expect(row.isActiveSubscriber).toBe(true);
    expect(row.hasDebt).toBe(true);
    expect(row.remainingDebtKd).toBe('10.0000');
  });

  it('CASE 4 — expired subscription with debt → NOT in subscribers list', async () => {
    process.env.STRICT_SUBSCRIBER_MEMBERSHIP = 'true';
    const { customers, subscriptions, debtBreakdown, orders: orderFixtures } = buildFixture();
    const prisma = makePrisma({ customers, subscriptions, orders: orderFixtures });
    const orders = makeOrders(debtBreakdown);
    const svc = new SubscribersService(prisma, orders, makeJournalSource());

    const rows = await svc.list();
    expect(rows.find((r) => r.customerId === C_EXPIRED)).toBeUndefined();
  });

  it('CASE 5 — subscriber count under strict mode equals number of currently-active subscriptions', async () => {
    process.env.STRICT_SUBSCRIBER_MEMBERSHIP = 'true';
    const { customers, subscriptions, debtBreakdown, orders: orderFixtures } = buildFixture();
    const prisma = makePrisma({ customers, subscriptions, orders: orderFixtures });
    const orders = makeOrders(debtBreakdown);
    const svc = new SubscribersService(prisma, orders, makeJournalSource());

    const rows = await svc.list();
    expect(rows).toHaveLength(2); // C_ACTIVE_NO_DEBT + C_ACTIVE_WITH_DEBT
    expect(rows.every((r) => r.isActiveSubscriber === true)).toBe(true);
  });

  it('legacy mode (env=false) still includes historic candidates but flags isActiveSubscriber correctly', async () => {
    process.env.STRICT_SUBSCRIBER_MEMBERSHIP = 'false';
    const { customers, subscriptions, debtBreakdown, orders: orderFixtures } = buildFixture();
    const prisma = makePrisma({ customers, subscriptions, orders: orderFixtures });
    const orders = makeOrders(debtBreakdown);
    const svc = new SubscribersService(prisma, orders, makeJournalSource());

    const rows = await svc.list();
    // Legacy candidate set: anyone with subscription history OR
    // wallet snapshot fields. C_DEBT_ONLY has a SUBSCRIPTION_ACTIVATION
    // history row (built in fixture).
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const expiredRow = rows.find((r) => r.customerId === C_EXPIRED);
    expect(expiredRow?.isActiveSubscriber).toBe(false);
    const activeRow = rows.find((r) => r.customerId === C_ACTIVE_WITH_DEBT);
    expect(activeRow?.isActiveSubscriber).toBe(true);
  });

  it('per-call includeInactive=true overrides the strict default', async () => {
    process.env.STRICT_SUBSCRIBER_MEMBERSHIP = 'true';
    const { customers, subscriptions, debtBreakdown, orders: orderFixtures } = buildFixture();
    const prisma = makePrisma({ customers, subscriptions, orders: orderFixtures });
    const orders = makeOrders(debtBreakdown);
    const svc = new SubscribersService(prisma, orders, makeJournalSource());

    const strictRows = await svc.list();
    const allRows = await svc.list(undefined, { includeInactive: true });

    expect(allRows.length).toBeGreaterThan(strictRows.length);
    const idsAll = allRows.map((r) => r.customerId);
    expect(idsAll).toContain(C_EXPIRED);
  });

  it('CASE 1 regression: silencing a customer with debt does NOT depend on cashStatus / wallet.debt', async () => {
    process.env.STRICT_SUBSCRIBER_MEMBERSHIP = 'true';
    const { customers, subscriptions, debtBreakdown, orders: orderFixtures } = buildFixture();
    // Stuff a UNPAID order into the prisma mock so the
    // collectionLinkStats query sees activity for C_DEBT_ONLY.
    const prisma = makePrisma({ customers, subscriptions, orders: orderFixtures });
    prisma.order.findMany = jest.fn(async () => [
      {
        customerId: C_DEBT_ONLY,
        reminderCount: 0,
        createdAt: PAST,
        posHostedPaymentUrl: null,
        status: OrderStatus.COMPLETED,
        cashStatus: CashStatus.UNPAID,
      },
    ]);
    const orders = makeOrders(debtBreakdown);
    const svc = new SubscribersService(prisma, orders, makeJournalSource());

    const rows = await svc.list();
    // Even with active UNPAID orders + wallet.debt > 0, the
    // customer must still be excluded from the subscribers list
    // because they have no active CustomerSubscription.
    expect(rows.find((r) => r.customerId === C_DEBT_ONLY)).toBeUndefined();
    void LedgerTransactionType; // silence unused-import lint
  });
});
