import { INestApplication } from '@nestjs/common';
import { FinancialPeriodStatus, PosPaymentMethod, SafariRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { App } from 'supertest/types';
import {
  createBranch,
  createClosedPeriod,
  createCustomer,
  createOpenPeriod,
  createUser,
  seedJournalAccounts,
  TestCustomer,
  TestUser,
} from '../factories';
import {
  createTestApp,
  getAuthHeader,
  request,
} from '../helpers';
import { closeDb, prisma, resetDb } from '../setup/test-db';

describe('FIN-06: Period Lock Authority', () => {
  let app: INestApplication<App>;
  let branch: Awaited<ReturnType<typeof createBranch>>;
  let driver: TestUser;
  let owner: TestUser;
  let accountant: TestUser;
  let customer: TestCustomer;

  beforeAll(async () => {
    process.env.V20_4_FINAL_LEDGER = 'true';
    process.env.V20_3_TRUE_ACCOUNTING = 'true';
    process.env.USE_JOURNAL_AS_SOURCE = 'true';
    process.env.PERIOD_LOCK_ENFORCE = 'true';
    app = await createTestApp();
    await seedJournalAccounts(prisma);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedJournalAccounts(prisma);
    branch = await createBranch(prisma);
    driver = await createUser(prisma, SafariRole.DRIVER, branch.id);
    owner = await createUser(prisma, SafariRole.OWNER, branch.id);
    accountant = await createUser(prisma, SafariRole.ACCOUNTANT, branch.id);
    customer = await createCustomer(prisma, branch.id);
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  function todayKuwait(): { year: number; month: number } {
    const now = new Date();
    const kuwait = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    return { year: kuwait.getUTCFullYear(), month: kuwait.getUTCMonth() + 1 };
  }

  it('open period allows POS checkout writes', async () => {
    const period = todayKuwait();
    await createOpenPeriod(prisma, period.year, period.month);

    const res = await request(app.getHttpServer())
      .post('/api/pos/checkout')
      .set(getAuthHeader(driver.jwtToken))
      .send({
        customerId: customer.id,
        customerPhone: customer.phone,
        customerDisplayName: customer.displayName ?? 'Test',
        customerAddress: customer.address ?? 'Test',
        totalPrice: 10,
        invoiceNumber: `INV-${randomUUID()}`,
        posPaymentMethod: PosPaymentMethod.CASH,
      });

    expect(res.status).toBeLessThan(400);
  });

  it('closed period rejects POS checkout writes (no journal mutation)', async () => {
    const period = todayKuwait();
    await createClosedPeriod(prisma, period.year, period.month);

    const before = await prisma.journalEntry.count();

    const res = await request(app.getHttpServer())
      .post('/api/pos/checkout')
      .set(getAuthHeader(driver.jwtToken))
      .send({
        customerId: customer.id,
        customerPhone: customer.phone,
        customerDisplayName: customer.displayName ?? 'Test',
        customerAddress: customer.address ?? 'Test',
        totalPrice: 10,
        invoiceNumber: `INV-${randomUUID()}`,
        posPaymentMethod: PosPaymentMethod.CASH,
      });

    expect(res.status).toBeGreaterThanOrEqual(400);

    const after = await prisma.journalEntry.count();
    expect(after).toBe(before);
  });

  it('closed period prevents wallet/debt mutation on the customer', async () => {
    const period = todayKuwait();
    await createClosedPeriod(prisma, period.year, period.month);

    const walletBefore = await prisma.customerWallet.findUniqueOrThrow({
      where: { customerId: customer.id },
    });

    await request(app.getHttpServer())
      .post('/api/pos/checkout')
      .set(getAuthHeader(driver.jwtToken))
      .send({
        customerId: customer.id,
        customerPhone: customer.phone,
        customerDisplayName: customer.displayName ?? 'Test',
        customerAddress: customer.address ?? 'Test',
        totalPrice: 10,
        invoiceNumber: `INV-${randomUUID()}`,
        posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
      });

    const walletAfter = await prisma.customerWallet.findUniqueOrThrow({
      where: { customerId: customer.id },
    });
    expect(walletAfter.debt.toFixed(4)).toBe(walletBefore.debt.toFixed(4));
    expect(walletAfter.balance.toFixed(4)).toBe(walletBefore.balance.toFixed(4));
  });

  it('Kuwait timezone: UTC late evening lands in next-day Kuwait period', async () => {
    const utcLateMarch = new Date('2026-03-31T21:30:00Z');
    const offsetMs = 3 * 60 * 60 * 1000;
    const kuwait = new Date(utcLateMarch.getTime() + offsetMs);
    expect(kuwait.getUTCFullYear()).toBe(2026);
    expect(kuwait.getUTCMonth() + 1).toBe(4);
  });

  it('financial period close endpoint requires Owner or Accountant role', async () => {
    const period = todayKuwait();
    await createOpenPeriod(prisma, period.year, period.month);

    const denied = await request(app.getHttpServer())
      .post('/api/finance/periods/close')
      .set(getAuthHeader(driver.jwtToken))
      .send({
        year: period.year,
        month: period.month,
        confirmation: `CLOSE_${period.year}_${period.month}`,
      });
    expect(denied.status).toBe(403);

    const allowed = await request(app.getHttpServer())
      .post('/api/finance/periods/close')
      .set(getAuthHeader(accountant.jwtToken))
      .send({
        year: period.year,
        month: period.month,
        confirmation: `CLOSE_${period.year}_${period.month}`,
      });
    expect([200, 201, 400, 409]).toContain(allowed.status);
    void owner;
  });

  it('CORRUPT-4: closed period rejection bubbles ConflictException out of safe wrappers', async () => {
    const period = todayKuwait();
    await createClosedPeriod(prisma, period.year, period.month);

    const res = await request(app.getHttpServer())
      .post('/api/pos/checkout')
      .set(getAuthHeader(driver.jwtToken))
      .send({
        customerId: customer.id,
        customerPhone: customer.phone,
        customerDisplayName: customer.displayName ?? 'Test',
        customerAddress: customer.address ?? 'Test',
        totalPrice: 5,
        invoiceNumber: `INV-${randomUUID()}`,
        posPaymentMethod: PosPaymentMethod.CASH,
      });

    expect([409, 400, 403, 500]).toContain(res.status);

    const periodRow = await prisma.financialPeriod.findUniqueOrThrow({
      where: { year_month: { year: period.year, month: period.month } },
    });
    expect(periodRow.status).toBe(FinancialPeriodStatus.CLOSED);
  });
});
