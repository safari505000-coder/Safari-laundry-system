import { INestApplication } from '@nestjs/common';
import { PosPaymentMethod, Prisma, SafariRole } from '@prisma/client';
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
import { createTestApp, getAuthHeader, getResponseData, request } from '../helpers';
import { closeDb, prisma, resetDb } from '../setup/test-db';

describe('SEC: Penetration Test STEAL Fix Verification', () => {
  let app: INestApplication<App>;
  let branch1: Awaited<ReturnType<typeof createBranch>>;
  let branch2: Awaited<ReturnType<typeof createBranch>>;
  let ccBranch1: TestUser;
  let driver1: TestUser;
  let driver2: TestUser;
  let customer1: TestCustomer;
  let customer2: TestCustomer;

  beforeAll(async () => {
    process.env.V20_4_FINAL_LEDGER = 'true';
    process.env.V20_3_TRUE_ACCOUNTING = 'true';
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedJournalAccounts(prisma);
    branch1 = await createBranch(prisma);
    branch2 = await createBranch(prisma);
    ccBranch1 = await createUser(prisma, SafariRole.CALL_CENTER, branch1.id);
    driver1 = await createUser(prisma, SafariRole.DRIVER, branch1.id);
    driver2 = await createUser(prisma, SafariRole.DRIVER, branch2.id);
    customer1 = await createCustomer(prisma, branch1.id);
    customer2 = await createCustomer(prisma, branch2.id);
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  it('STEAL-1: companySupportAmountKd cannot exceed plan actualBalance', async () => {
    const plan = await prisma.subscriptionPlan.create({
      data: {
        name: `Plan ${randomUUID()}`,
        salePrice: new Prisma.Decimal('10.0000'),
        actualBalance: new Prisma.Decimal('15.0000'),
        validityDays: 30,
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/call-center/subscriptions/activate')
      .set(getAuthHeader(ccBranch1.jwtToken))
      .send({
        customerId: customer1.id,
        planId: plan.id,
        paymentMethod: PosPaymentMethod.CASH,
        companySupportAmountKd: '999999.0000',
      });

    expect([400, 403, 422]).toContain(res.status);

    const wallet = await prisma.customerWallet.findUniqueOrThrow({
      where: { customerId: customer1.id },
    });
    expect(wallet.balance.toFixed(4)).toBe('0.0000');
  });

  it('STEAL-2: driver deposit settlement uses Decimal arithmetic only', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/pos/checkout')
        .set(getAuthHeader(driver1.jwtToken))
        .send({
          customerId: customer1.id,
          customerPhone: customer1.phone,
          customerDisplayName: customer1.displayName ?? 'Test',
          customerAddress: customer1.address ?? 'Test',
          totalPrice: 1.0001,
          invoiceNumber: `INV-${randomUUID()}`,
          posPaymentMethod: PosPaymentMethod.CASH,
        });
      expect(res.status).toBeLessThan(400);
    }

    const orders = await prisma.order.findMany({
      where: { driverId: driver1.id },
      select: { totalPrice: true },
    });

    const totalMinor = orders.reduce(
      (acc, o) => acc + BigInt(o.totalPrice.times(10000).toFixed(0)),
      0n,
    );
    expect(totalMinor).toBe(100010n);
  });

  it('STEAL-3: CC agent on branch1 cannot mark-paid order from branch2', async () => {
    const checkout = await request(app.getHttpServer())
      .post('/api/pos/checkout')
      .set(getAuthHeader(driver2.jwtToken))
      .send({
        customerId: customer2.id,
        customerPhone: customer2.phone,
        customerDisplayName: customer2.displayName ?? 'Test',
        customerAddress: customer2.address ?? 'Test',
        totalPrice: 12,
        invoiceNumber: `INV-${randomUUID()}`,
        posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
      });
    expect(checkout.status).toBeLessThan(400);
    const orderId = getResponseData<{ id: string }>(checkout.body).id;

    const denied = await request(app.getHttpServer())
      .post(`/api/call-center/orders/${orderId}/mark-paid`)
      .set(getAuthHeader(ccBranch1.jwtToken))
      .send({ paymentMethod: 'CASH' });

    expect([403, 404]).toContain(denied.status);
  });
});
