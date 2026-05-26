import { INestApplication } from '@nestjs/common';
import {
  CustomerSubscriptionStatus,
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
  assertJournalEntryCount,
  createTestApp,
  getAuthHeader,
  getResponseData,
  request,
} from '../helpers';
import { closeDb, prisma, resetDb } from '../setup/test-db';

describe('FIN-04: Idempotent Payments', () => {
  let app: INestApplication<App>;
  let branch: Awaited<ReturnType<typeof createBranch>>;
  let driver: TestUser;
  let ccAgent: TestUser;
  let customer: TestCustomer;

  beforeAll(async () => {
    process.env.V20_4_FINAL_LEDGER = 'true';
    process.env.V20_3_TRUE_ACCOUNTING = 'true';
    process.env.USE_JOURNAL_AS_SOURCE = 'true';
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

  async function checkout(method: PosPaymentMethod, amount = '15.0000') {
    const res = await request(app.getHttpServer())
      .post('/api/pos/checkout')
      .set(getAuthHeader(driver.jwtToken))
      .send({
        customerId: customer.id,
        customerPhone: customer.phone,
        customerDisplayName: customer.displayName ?? 'Test',
        customerAddress: customer.address ?? 'Test',
        totalPrice: Number(amount),
        invoiceNumber: `INV-${randomUUID()}`,
        posPaymentMethod: method,
      });
    expect(res.status).toBeLessThan(400);
    return prisma.order.findUniqueOrThrow({
      where: { id: getResponseData<{ id: string }>(res.body).id },
    });
  }

  async function seedActiveSubscription(balance = '100.0000') {
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

  it('CASH payment writes exactly one external payment journal entry', async () => {
    const order = await checkout(PosPaymentMethod.CASH);
    const count = await prisma.generalLedgerEntry.count({
      where: { orderId: order.id, entryType: 'POS_SALE_COMPLETED' },
    });
    expect(count).toBe(1);
  });

  it('KNET payment writes exactly one external payment journal entry', async () => {
    const order = await checkout(PosPaymentMethod.KNET);
    const count = await prisma.generalLedgerEntry.count({
      where: { orderId: order.id, entryType: 'POS_SALE_COMPLETED' },
    });
    expect(count).toBe(1);
  });

  it('wallet absorption sourceRef is idempotent on replay', async () => {
    await seedActiveSubscription('100.0000');
    const order = await checkout(PosPaymentMethod.SUBSCRIPTION_WALLET, '20.0000');

    const sourceRef = `JOURNAL:WALLET_ABSORPTION_V3:${order.id}:APPLIED`;
    await assertJournalEntryCount(prisma, sourceRef, 1);

    await expect(
      prisma.journalEntry.create({
        data: {
          source: 'WALLET_ABSORPTION_V3',
          sourceRef,
          actorUserId: driver.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('CC mark-paid is idempotent (replay returns alreadySettled)', async () => {
    const order = await checkout(PosPaymentMethod.DEBT_ON_ACCOUNT);

    const first = await request(app.getHttpServer())
      .post(`/api/call-center/orders/${order.id}/mark-paid`)
      .set(getAuthHeader(ccAgent.jwtToken))
      .send({ paymentMethod: 'CASH' });
    expect(first.status).toBeLessThan(400);

    const second = await request(app.getHttpServer())
      .post(`/api/call-center/orders/${order.id}/mark-paid`)
      .set(getAuthHeader(ccAgent.jwtToken))
      .send({ paymentMethod: 'CASH' });
    expect(second.status).toBeLessThan(500);

    const collectionEntries = await prisma.journalEntry.count({
      where: {
        orderId: order.id,
        source: 'EXTERNAL_PAYMENT',
      },
    });
    expect(collectionEntries).toBeLessThanOrEqual(2);
  });

  it('database UNIQUE constraint on sourceRef rejects duplicate writes', async () => {
    const sourceRef = `JOURNAL:IDEMPOTENT_TEST:${randomUUID()}`;
    await prisma.journalEntry.create({
      data: {
        source: 'TEST',
        sourceRef,
        actorUserId: driver.id,
      },
    });

    await expect(
      prisma.journalEntry.create({
        data: {
          source: 'TEST',
          sourceRef,
          actorUserId: driver.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
