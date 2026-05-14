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
  assertDecimalEqual,
  createTestApp,
  getArBalance,
  getAuthHeader,
  request,
} from '../helpers';
import { closeDb, prisma, resetDb } from '../setup/test-db';

describe('FIN-02: Canonical Customer Debt', () => {
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
        customerDisplayName: customer.displayName ?? 'Test Customer',
        customerAddress: customer.address ?? 'Test Address',
        totalPrice: Number(amountKd),
        invoiceNumber: `INV-${randomUUID()}`,
        posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
      });

    expect(res.status).toBeLessThan(400);
    return prisma.order.findUniqueOrThrow({
      where: { id: (res.body as { id: string }).id },
    });
  }

  it('debt invoice creates AR balance equal to invoice total', async () => {
    await createDebtOrder('25.0000');

    const ar = await getArBalance(prisma, customer.id);
    assertDecimalEqual(ar, '25.0000');
  });

  it('partial payment via call center reduces journal AR', async () => {
    const order = await createDebtOrder('100.0000');

    const res = await request(app.getHttpServer())
      .post(`/api/call-center/customers/${customer.id}/partial-debt-payment`)
      .set(getAuthHeader(ccAgent.jwtToken))
      .send({
        amountKd: '40.0000',
        paymentMethod: 'CASH',
      });

    expect(res.status).toBeLessThan(400);

    const ar = await getArBalance(prisma, customer.id);
    assertDecimalEqual(ar, '60.0000');

    const wallet = await prisma.customerWallet.findUniqueOrThrow({
      where: { customerId: customer.id },
    });
    expect(wallet.debt.toFixed(4)).toBe('60.0000');
    void order;
  });

  it('full payment via call center clears AR to zero', async () => {
    await createDebtOrder('50.0000');

    const res = await request(app.getHttpServer())
      .post(`/api/call-center/customers/${customer.id}/partial-debt-payment`)
      .set(getAuthHeader(ccAgent.jwtToken))
      .send({
        amountKd: '50.0000',
        paymentMethod: 'CASH',
      });

    expect(res.status).toBeLessThan(400);

    const ar = await getArBalance(prisma, customer.id);
    assertDecimalEqual(ar, '0.0000');
  });

  it('wallet absorption reduces customer AR debt', async () => {
    await prisma.customerWallet.update({
      where: { customerId: customer.id },
      data: { balance: new Prisma.Decimal('30.0000') },
    });

    const res = await request(app.getHttpServer())
      .post('/api/pos/checkout')
      .set(getAuthHeader(driver.jwtToken))
      .send({
        customerId: customer.id,
        customerPhone: customer.phone,
        customerDisplayName: customer.displayName ?? 'Test Customer',
        customerAddress: customer.address ?? 'Test Address',
        totalPrice: 20,
        invoiceNumber: `INV-${randomUUID()}`,
        posPaymentMethod: PosPaymentMethod.SUBSCRIPTION_WALLET,
      });

    expect(res.status).toBeLessThan(400);

    const ar = await getArBalance(prisma, customer.id);
    assertDecimalEqual(ar, '0.0000');

    const wallet = await prisma.customerWallet.findUniqueOrThrow({
      where: { customerId: customer.id },
    });
    expect(wallet.balance.toFixed(4)).toBe('10.0000');
  });

  it('multiple debt invoices accumulate in journal AR', async () => {
    await createDebtOrder('15.0000');
    await createDebtOrder('25.0000');
    await createDebtOrder('10.0000');

    const ar = await getArBalance(prisma, customer.id);
    assertDecimalEqual(ar, '50.0000');
  });

  it('total customer AR matches per-customer sum', async () => {
    const second = await createCustomer(prisma, branch.id);

    await createDebtOrder('30.0000');

    const secondRes = await request(app.getHttpServer())
      .post('/api/pos/checkout')
      .set(getAuthHeader(driver.jwtToken))
      .send({
        customerId: second.id,
        customerPhone: second.phone,
        customerDisplayName: second.displayName ?? 'Second Customer',
        customerAddress: second.address ?? 'Test Address',
        totalPrice: 70,
        invoiceNumber: `INV-${randomUUID()}`,
        posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
      });
    expect(secondRes.status).toBeLessThan(400);

    const arAccount = await prisma.account.findUniqueOrThrow({
      where: { code: '1300' },
      select: { id: true },
    });

    const totals = await prisma.journalLine.aggregate({
      where: { accountId: arAccount.id },
      _sum: { debit: true, credit: true },
    });

    const debit = totals._sum.debit ?? new Prisma.Decimal('0');
    const credit = totals._sum.credit ?? new Prisma.Decimal('0');
    assertDecimalEqual(debit.minus(credit), '100.0000');
  });
});
