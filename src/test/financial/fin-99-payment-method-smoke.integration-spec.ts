import { INestApplication } from '@nestjs/common';
import { CustomerSubscriptionStatus, PosPaymentMethod, Prisma, SafariRole } from '@prisma/client';
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
  buildPosCheckoutLineItemsForTotal,
  createTestApp,
  getArBalance,
  getAuthHeader,
  getResponseData,
  request,
} from '../helpers';
import { closeDb, prisma, resetDb } from '../setup/test-db';

type Line = {
  account: { code: string };
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
};

const externalExpectations = [
  { method: PosPaymentMethod.CASH, assetAccount: '1100' },
  { method: PosPaymentMethod.KNET, assetAccount: '1200' },
  { method: PosPaymentMethod.ONLINE, assetAccount: '1210' },
  { method: PosPaymentMethod.PAYMENT_LINK, assetAccount: '1210' },
] as const;

describe('FIN-99: payment method smoke', () => {
  let app: INestApplication<App>;
  let branch: Awaited<ReturnType<typeof createBranch>>;
  let driver: TestUser;
  let ccAgent: TestUser;
  let customer: TestCustomer;

  beforeAll(async () => {
    process.env.V20_4_FINAL_LEDGER = 'true';
    process.env.V20_3_TRUE_ACCOUNTING = 'true';
    process.env.USE_JOURNAL_AS_SOURCE = 'true';
    process.env.PAYMENT_LINK_IMMEDIATE_DEBT = 'true';
    process.env.PAYMENTS_MOCK = 'true';
    app = await createTestApp();
    await seedJournalAccounts(prisma);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedJournalAccounts(prisma);
    branch = await createBranch(prisma);
    driver = await createUser(prisma, SafariRole.DRIVER, branch.id);
    ccAgent = await createUser(prisma, SafariRole.CALL_CENTER, branch.id);
    customer = await createCustomer(prisma, branch.id);
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  async function checkout(method: PosPaymentMethod, amount = '10.0000') {
    const res = await request(app.getHttpServer())
      .post('/api/pos/checkout')
      .set(getAuthHeader(driver.jwtToken))
      .send({
        customerId: customer.id,
        customerPhone: customer.phone,
        customerDisplayName: customer.displayName ?? 'Smoke Customer',
        customerAddress: customer.address ?? 'Smoke Address',
        totalPrice: amount,
        lineItems: await buildPosCheckoutLineItemsForTotal(prisma, amount),
        invoiceNumber: `SMOKE-${randomUUID()}`,
        posPaymentMethod: method,
      });

    expect(res.status).toBeLessThan(400);
    return prisma.order.findUniqueOrThrow({
      where: { id: getResponseData<{ id: string }>(res.body).id },
    });
  }

  async function simulateGatewayCapture(orderId: string) {
    const res = await request(app.getHttpServer())
      .post('/api/payments/callback')
      .send({
        orderId,
        status: 'success',
        devMock: true,
      });

    expect(res.status).toBeLessThan(400);
  }

  async function linesFor(sourceRef: string): Promise<Line[]> {
    const entry = await prisma.journalEntry.findUniqueOrThrow({
      where: { sourceRef },
    });
    await assertJournalBalanced(prisma, entry.id);
    return prisma.journalLine.findMany({
      where: { entryId: entry.id },
      include: { account: { select: { code: true } } },
    });
  }

  async function externalPaymentLinesForOrder(orderId: string): Promise<Line[]> {
    const entry = await prisma.journalEntry.findFirstOrThrow({
      where: { orderId, source: 'EXTERNAL_PAYMENT' },
      orderBy: { createdAt: 'desc' },
    });
    await assertJournalBalanced(prisma, entry.id);
    return prisma.journalLine.findMany({
      where: { entryId: entry.id },
      include: { account: { select: { code: true } } },
    });
  }

  async function countExternalPaymentEntries(orderId: string): Promise<number> {
    return prisma.journalEntry.count({
      where: { orderId, source: 'EXTERNAL_PAYMENT' },
    });
  }

  function expectLine(lines: Line[], code: string, side: 'debit' | 'credit', amount: string) {
    const line = lines.find((candidate) => candidate.account.code === code);
    expect(line).toBeDefined();
    assertDecimalEqual(line![side], amount);
  }

  async function createActiveSubscription() {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const plan = await prisma.subscriptionPlan.create({
      data: {
        name: `Smoke Plan ${randomUUID()}`,
        salePrice: new Prisma.Decimal('10.0000'),
        actualBalance: new Prisma.Decimal('10.0000'),
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
        balance: new Prisma.Decimal('10.0000'),
        subscriptionPlanId: plan.id,
        subscriptionPlanName: plan.name,
        subscriptionActivatedAt: now,
        subscriptionExpiresAt: expiresAt,
      },
    });
  }

  it.each(externalExpectations)(
    '$method settles AR to the correct asset account',
    async ({ method, assetAccount }) => {
      const order = await checkout(method, '10.0000');
      if (
        method === PosPaymentMethod.ONLINE ||
        method === PosPaymentMethod.PAYMENT_LINK
      ) {
        await simulateGatewayCapture(order.id);
      }

      expectLine(
        await linesFor(
          method === PosPaymentMethod.ONLINE ||
            method === PosPaymentMethod.PAYMENT_LINK
            ? `PAYMENT_LINK_RECEIVABLE:${order.id}`
            : `JOURNAL:INVOICE_ISSUED:${order.id}`,
        ),
        '1300',
        'debit',
        '10.0000',
      );
      const paymentLines = await externalPaymentLinesForOrder(order.id);
      expectLine(paymentLines, assetAccount, 'debit', '10.0000');
      expectLine(
        paymentLines,
        '1300',
        'credit',
        '10.0000',
      );
      expect(await countExternalPaymentEntries(order.id)).toBe(1);
      assertDecimalEqual(await getArBalance(prisma, customer.id), '0.0000');
    },
  );

  it('DEBT_ON_ACCOUNT leaves AR open until call-center mark-paid closes it', async () => {
    const order = await checkout(PosPaymentMethod.DEBT_ON_ACCOUNT, '10.0000');

    assertDecimalEqual(await getArBalance(prisma, customer.id), '10.0000');

    const res = await request(app.getHttpServer())
      .post(`/api/call-center/orders/${order.id}/mark-paid`)
      .set(getAuthHeader(ccAgent.jwtToken))
      .send({ paymentMethod: 'CASH' });

    expect(res.status).toBeLessThan(400);
    expect(await countExternalPaymentEntries(order.id)).toBe(1);
    expectLine(
      await externalPaymentLinesForOrder(order.id),
      '1100',
      'debit',
      '10.0000',
    );
    assertDecimalEqual(await getArBalance(prisma, customer.id), '0.0000');
  });

  it('SUBSCRIPTION_WALLET consumes wallet liability and clears AR', async () => {
    await createActiveSubscription();

    const order = await checkout(PosPaymentMethod.SUBSCRIPTION_WALLET, '10.0000');

    expectLine(
      await linesFor(`JOURNAL:INVOICE_ISSUED:${order.id}`),
      '1300',
      'debit',
      '10.0000',
    );
    expectLine(
      await linesFor(`JOURNAL:WALLET_ABSORPTION_V3:${order.id}:APPLIED`),
      '2100',
      'debit',
      '10.0000',
    );
    expectLine(
      await linesFor(`JOURNAL:WALLET_ABSORPTION_V3:${order.id}:APPLIED`),
      '1300',
      'credit',
      '10.0000',
    );
    assertDecimalEqual(await getArBalance(prisma, customer.id), '0.0000');
  });

  it('SUBSCRIPTION_WALLET with low balance consumes wallet and leaves shortfall as AR debt', async () => {
    await createActiveSubscription();
    await prisma.customerWallet.update({
      where: { customerId: customer.id },
      data: { balance: new Prisma.Decimal('4.0000') },
    });

    const order = await checkout(PosPaymentMethod.SUBSCRIPTION_WALLET, '10.0000');

    expectLine(
      await linesFor(`JOURNAL:WALLET_ABSORPTION_V3:${order.id}:APPLIED`),
      '2100',
      'debit',
      '4.0000',
    );
    expectLine(
      await linesFor(`JOURNAL:WALLET_ABSORPTION_V3:${order.id}:APPLIED`),
      '1300',
      'credit',
      '4.0000',
    );
    assertDecimalEqual(await getArBalance(prisma, customer.id), '6.0000');
    expect(await countExternalPaymentEntries(order.id)).toBe(0);

    const wallet = await prisma.customerWallet.findUniqueOrThrow({
      where: { customerId: customer.id },
      select: { balance: true, debt: true },
    });
    assertDecimalEqual(wallet.balance, '0.0000');
    assertDecimalEqual(wallet.debt, '6.0000');
  });

  it('rejects SUBSCRIPTION_WALLET when the customer has no active subscription', async () => {
    await prisma.customerWallet.update({
      where: { customerId: customer.id },
      data: { balance: new Prisma.Decimal('10.0000') },
    });

    const res = await request(app.getHttpServer())
      .post('/api/pos/checkout')
      .set(getAuthHeader(driver.jwtToken))
      .send({
        customerId: customer.id,
        customerPhone: customer.phone,
        customerDisplayName: customer.displayName ?? 'Smoke Customer',
        customerAddress: customer.address ?? 'Smoke Address',
        totalPrice: '10.0000',
        lineItems: await buildPosCheckoutLineItemsForTotal(prisma, '10.0000'),
        invoiceNumber: `SMOKE-${randomUUID()}`,
        posPaymentMethod: PosPaymentMethod.SUBSCRIPTION_WALLET,
      });

    expect(res.status).toBe(400);
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.journalEntry.count()).toBe(0);
  });
});
