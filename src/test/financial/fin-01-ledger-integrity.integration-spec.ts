import { INestApplication } from '@nestjs/common';
import {
  CashStatus,
  CustomerSubscriptionStatus,
  Order,
  PosPaymentMethod,
  Prisma,
  SafariRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { App } from 'supertest/types';
import {
  createBranch,
  createCustomer,
  createUser,
  seedJournalAccounts,
  TestCustomer,
  TestUser,
} from '../factories';
import {
  assertDecimalEqual,
  assertJournalBalanced,
  assertJournalEntryExists,
  createTestApp,
  getResponseData,
  getArBalance,
  getAuthHeader,
  request,
} from '../helpers';
import { closeDb, prisma, resetDb } from '../setup/test-db';

type JournalLineWithAccount = {
  account: { code: string };
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
};

describe('FIN-01: Ledger Integrity', () => {
  let app: INestApplication<App>;
  let branch: Awaited<ReturnType<typeof createBranch>>;
  let owner: TestUser;
  let driver: TestUser;
  let customer: TestCustomer;

  beforeAll(async () => {
    process.env.V20_4_FINAL_LEDGER = 'true';
    process.env.V20_3_TRUE_ACCOUNTING = 'true';
    process.env.USE_JOURNAL_AS_SOURCE = 'true';
    process.env.PAYMENTS_MOCK = 'true';

    app = await createTestApp();
    await seedJournalAccounts(prisma);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedJournalAccounts(prisma);
    branch = await createBranch(prisma);
    owner = await createUser(prisma, SafariRole.OWNER, branch.id);
    driver = await createUser(prisma, SafariRole.DRIVER, branch.id);
    customer = await createCustomer(prisma, branch.id);
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  async function posCheckout(
    paymentMethod: PosPaymentMethod,
    amount = '10.0000',
  ): Promise<Order> {
    const res = await request(app.getHttpServer())
      .post('/api/pos/checkout')
      .set(getAuthHeader(driver.jwtToken))
      .send({
        customerId: customer.id,
        customerPhone: customer.phone,
        customerDisplayName: customer.displayName ?? 'Test Customer',
        customerAddress: customer.address ?? 'Test Address',
        totalPrice: amount,
        invoiceNumber: `INV-${randomUUID()}`,
        posPaymentMethod: paymentMethod,
      });

    expect(res.status).toBeLessThan(400);
    const body = getResponseData<{ id?: string }>(res.body);
    expect(body.id).toBeDefined();

    return prisma.order.findUniqueOrThrow({
      where: { id: body.id },
    });
  }

  async function getEntryLines(sourceRef: string): Promise<JournalLineWithAccount[]> {
    const entry = await assertJournalEntryExists(prisma, sourceRef);
    return prisma.journalLine.findMany({
      where: { entryId: entry.id },
      include: { account: { select: { code: true } } },
      orderBy: { account: { code: 'asc' } },
    });
  }

  function expectLine(
    lines: JournalLineWithAccount[],
    code: string,
    side: 'debit' | 'credit',
    amount: string,
  ): void {
    const line = lines.find((candidate) => candidate.account.code === code);
    expect(line).toBeDefined();
    assertDecimalEqual(line![side], amount);
  }

  async function seedActiveSubscription(balance = '25.0000') {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const plan = await prisma.subscriptionPlan.create({
      data: {
        name: `Test Plan ${randomUUID()}`,
        salePrice: new Prisma.Decimal(balance),
        actualBalance: new Prisma.Decimal(balance),
        validityDays: 30,
      },
    });
    await prisma.customerSubscription.create({
      data: {
        customerId: customer.id,
        planId: plan.id,
        status: CustomerSubscriptionStatus.ACTIVE,
        planNameSnapshot: plan.name,
        planSalePriceSnapshot: plan.salePrice,
        planActualBalanceSnapshot: plan.actualBalance,
        planValidityDaysSnapshot: plan.validityDays,
        activatedAt: now,
        expiresAt,
      },
    });
    await prisma.customerWallet.update({
      where: { customerId: customer.id },
      data: {
        balance: new Prisma.Decimal(balance),
        subscriptionPlanId: plan.id,
        subscriptionPlanName: plan.name,
        subscriptionActivatedAt: now,
        subscriptionExpiresAt: expiresAt,
      },
    });
  }

  it('invoice issuance creates balanced journal entry', async () => {
    const order = await posCheckout(PosPaymentMethod.DEBT_ON_ACCOUNT);
    const sourceRef = `JOURNAL:INVOICE_ISSUED:${order.id}`;
    const entry = await assertJournalEntryExists(prisma, sourceRef);

    await assertJournalBalanced(prisma, entry.id);
    const lines = await getEntryLines(sourceRef);
    expectLine(lines, '1300', 'debit', '10.0000');
    expectLine(lines, '4100', 'credit', '10.0000');
    await expect(
      prisma.journalEntry.create({
        data: {
          source: 'DUPLICATE_TEST',
          sourceRef,
          actorUserId: owner.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('cash payment creates balanced journal entry', async () => {
    const order = await posCheckout(PosPaymentMethod.CASH);
    const entries = await prisma.generalLedgerEntry.findMany({
      where: { orderId: order.id, entryType: 'POS_SALE_COMPLETED' },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.amount.toFixed(4)).toBe('10.0000');
  });

  it('KNET payment creates balanced journal entry', async () => {
    const order = await posCheckout(PosPaymentMethod.KNET);
    const entries = await prisma.generalLedgerEntry.findMany({
      where: { orderId: order.id, entryType: 'POS_SALE_COMPLETED' },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.amount.toFixed(4)).toBe('10.0000');
  });

  it('wallet absorption creates balanced journal entry', async () => {
    await seedActiveSubscription('25.0000');

    const order = await posCheckout(PosPaymentMethod.SUBSCRIPTION_WALLET);
    const sourceRef = `JOURNAL:WALLET_ABSORPTION_V3:${order.id}:APPLIED`;
    const entry = await assertJournalEntryExists(prisma, sourceRef);

    await assertJournalBalanced(prisma, entry.id);
    const lines = await getEntryLines(sourceRef);
    expectLine(lines, '2100', 'debit', '10.0000');
    expectLine(lines, '1300', 'credit', '10.0000');
  });

  it('subscription activation creates balanced journal entry', async () => {
    const plan = await prisma.subscriptionPlan.create({
      data: {
        name: `Test Plan ${randomUUID()}`,
        salePrice: new Prisma.Decimal('10.0000'),
        actualBalance: new Prisma.Decimal('15.0000'),
        validityDays: 30,
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/call-center/subscriptions/activate')
      .set(getAuthHeader(owner.jwtToken))
      .send({
        customerId: customer.id,
        planId: plan.id,
        paymentMethod: PosPaymentMethod.CASH,
        companySupportAmountKd: '5.0000',
      });

    expect(res.status).toBeLessThan(400);
    const entries = await prisma.journalEntry.findMany({
      where: {
        customerId: customer.id,
        source: 'PROCESS_TRANSACTION',
      },
      include: { lines: { include: { account: { select: { code: true } } } } },
    });
    expect(entries.length).toBeGreaterThan(0);

    const entry = entries[0]!;
    await assertJournalBalanced(prisma, entry.id);
    expect(entry.lines.some((line) => line.account.code === '1100')).toBe(true);
    expect(entry.lines.some((line) => line.account.code === '2100')).toBe(true);
    expect(entry.lines.some((line) => line.account.code === '5300')).toBe(true);
  });

  it('invoice cancellation creates balanced reversal', async () => {
    const order = await posCheckout(PosPaymentMethod.DEBT_ON_ACCOUNT);

    const res = await request(app.getHttpServer())
      .post(`/api/invoice-audit/orders/${order.id}/void`)
      .set(getAuthHeader(owner.jwtToken))
      .send({ reason: 'Integration test void reason' });

    expect(res.status).toBeLessThan(400);
    const sourceRef = `JOURNAL:INVOICE_CANCELED:${order.id}`;
    const entry = await assertJournalEntryExists(prisma, sourceRef);

    await assertJournalBalanced(prisma, entry.id);
    const ar = await getArBalance(prisma, customer.id);
    expect(ar.lessThanOrEqualTo(0)).toBe(true);
  });

  it('has no orphaned journal lines', async () => {
    await posCheckout(PosPaymentMethod.CASH);
    await posCheckout(PosPaymentMethod.KNET);

    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "JournalLine" jl
      WHERE NOT EXISTS (
        SELECT 1 FROM "JournalEntry" je WHERE je.id = jl."entryId"
      )
    `;

    expect(Number(rows[0]?.count ?? 0n)).toBe(0);
  });

  it('sourceRef uniqueness is enforced by DB', async () => {
    const sourceRef = `JOURNAL:UNIQUE_TEST:${randomUUID()}`;
    await prisma.journalEntry.create({
      data: {
        source: 'UNIQUE_TEST',
        sourceRef,
        actorUserId: owner.id,
      },
    });

    await expect(
      prisma.journalEntry.create({
        data: {
          source: 'UNIQUE_TEST',
          sourceRef,
          actorUserId: owner.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
