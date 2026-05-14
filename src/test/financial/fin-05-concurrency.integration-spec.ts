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
import {
  createTestApp,
  getArBalance,
  getAuthHeader,
  request,
} from '../helpers';
import { closeDb, prisma, resetDb } from '../setup/test-db';

describe('FIN-05: Concurrency and Locks', () => {
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
    await resetDb();
    await seedJournalAccounts(prisma);
    branch = await createBranch(prisma);
    driver = await createUser(prisma, SafariRole.DRIVER, branch.id);
    ccAgent = await createUser(prisma, SafariRole.CALL_CENTER, branch.id);
    customer = await createCustomer(prisma, branch.id);
  });

  afterAll(async () => {
    await closeDb();
    await app.close();
  });

  async function createDebtOrder(amountKd: string) {
    const res = await request(app.getHttpServer())
      .post('/api/pos/checkout')
      .set(getAuthHeader(driver.jwtToken))
      .send({
        customerId: customer.id,
        customerPhone: customer.phone,
        customerDisplayName: customer.displayName ?? 'Test',
        customerAddress: customer.address ?? 'Test',
        totalPrice: Number(amountKd),
        invoiceNumber: `INV-${randomUUID()}`,
        posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
      });
    expect(res.status).toBeLessThan(400);
    return prisma.order.findUniqueOrThrow({
      where: { id: (res.body as { id: string }).id },
    });
  }

  it('concurrent partial payments never let AR go negative', async () => {
    await createDebtOrder('100.0000');

    const promises = Array.from({ length: 20 }, () =>
      request(app.getHttpServer())
        .post(`/api/call-center/customers/${customer.id}/partial-debt-payment`)
        .set(getAuthHeader(ccAgent.jwtToken))
        .send({ amountKd: '10.0000', paymentMethod: 'CASH' }),
    );

    await Promise.allSettled(promises);

    const ar = await getArBalance(prisma, customer.id);
    expect(ar.greaterThanOrEqualTo(0)).toBe(true);

    const wallet = await prisma.customerWallet.findUniqueOrThrow({
      where: { customerId: customer.id },
    });
    expect(wallet.debt.greaterThanOrEqualTo(0)).toBe(true);
  });

  it('concurrent CC mark-paid attempts settle order at most once', async () => {
    const order = await createDebtOrder('30.0000');

    const promises = Array.from({ length: 10 }, () =>
      request(app.getHttpServer())
        .post(`/api/call-center/orders/${order.id}/mark-paid`)
        .set(getAuthHeader(ccAgent.jwtToken))
        .send({ paymentMethod: 'CASH' }),
    );

    await Promise.allSettled(promises);

    const externalPayments = await prisma.journalEntry.count({
      where: { orderId: order.id, source: 'EXTERNAL_PAYMENT' },
    });
    expect(externalPayments).toBeLessThanOrEqual(2);

    const ar = await getArBalance(prisma, customer.id);
    expect(ar.greaterThanOrEqualTo(0)).toBe(true);
  });

  it('concurrent debt invoice creation produces unique journal entries', async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      request(app.getHttpServer())
        .post('/api/pos/checkout')
        .set(getAuthHeader(driver.jwtToken))
        .send({
          customerId: customer.id,
          customerPhone: customer.phone,
          customerDisplayName: customer.displayName ?? 'Test',
          customerAddress: customer.address ?? 'Test',
          totalPrice: 5,
          invoiceNumber: `INV-CONCURRENT-${i}-${randomUUID()}`,
          posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
        }),
    );

    const results = await Promise.allSettled(promises);
    const successful = results.filter(
      (r) => r.status === 'fulfilled' && r.value.status < 400,
    );
    expect(successful.length).toBeGreaterThan(0);

    const issuedEntries = await prisma.journalEntry.count({
      where: { customerId: customer.id, source: 'INVOICE_ISSUED' },
    });

    expect(issuedEntries).toBe(successful.length);
  });

  it('wallet balance never goes negative under concurrent absorption load', async () => {
    await prisma.customerWallet.update({
      where: { customerId: customer.id },
      data: { balance: new Prisma.Decimal('10.0000') },
    });

    const promises = Array.from({ length: 20 }, () =>
      request(app.getHttpServer())
        .post('/api/pos/checkout')
        .set(getAuthHeader(driver.jwtToken))
        .send({
          customerId: customer.id,
          customerPhone: customer.phone,
          customerDisplayName: customer.displayName ?? 'Test',
          customerAddress: customer.address ?? 'Test',
          totalPrice: 1,
          invoiceNumber: `INV-WAL-${randomUUID()}`,
          posPaymentMethod: PosPaymentMethod.SUBSCRIPTION_WALLET,
        }),
    );

    await Promise.allSettled(promises);

    const wallet = await prisma.customerWallet.findUniqueOrThrow({
      where: { customerId: customer.id },
    });
    expect(wallet.balance.greaterThanOrEqualTo(0)).toBe(true);
  });
});
