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

describe('FIN-03: Decimal Precision', () => {
  let app: INestApplication<App>;
  let branch: Awaited<ReturnType<typeof createBranch>>;
  let driver: TestUser;
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
    customer = await createCustomer(prisma, branch.id);
  });

  afterAll(async () => {
    await closeDb();
    await app.close();
  });

  async function checkout(amountKd: string, method: PosPaymentMethod) {
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
        posPaymentMethod: method,
      });
    expect(res.status).toBeLessThan(400);
    return prisma.order.findUniqueOrThrow({
      where: { id: (res.body as { id: string }).id },
    });
  }

  const edgeCases = [
    { amount: '0.0010', label: 'sub-fils precision (1 fils)' },
    { amount: '0.0050', label: 'half-fils boundary' },
    { amount: '1.2355', label: 'banker rounding boundary' },
    { amount: '999.9999', label: 'near-integer boundary' },
  ];

  for (const { amount, label } of edgeCases) {
    it(`handles ${label} (${amount} KWD) without float drift`, async () => {
      const order = await checkout(amount, PosPaymentMethod.DEBT_ON_ACCOUNT);

      expect(order.totalPrice.toFixed(4)).toBe(amount);

      const ar = await getArBalance(prisma, customer.id);
      assertDecimalEqual(ar, amount);
    });
  }

  it('large amount preserves all 4 decimal places', async () => {
    await checkout('123456.7891', PosPaymentMethod.DEBT_ON_ACCOUNT);
    const ar = await getArBalance(prisma, customer.id);
    assertDecimalEqual(ar, '123456.7891');
  });

  it('multiple precise amounts sum to exact total', async () => {
    await checkout('1.0001', PosPaymentMethod.DEBT_ON_ACCOUNT);
    await checkout('2.0002', PosPaymentMethod.DEBT_ON_ACCOUNT);
    await checkout('3.0003', PosPaymentMethod.DEBT_ON_ACCOUNT);

    const ar = await getArBalance(prisma, customer.id);
    assertDecimalEqual(ar, '6.0006');
  });

  it('Prisma.Decimal arithmetic matches journal lines exactly', async () => {
    const order = await checkout('99.9999', PosPaymentMethod.DEBT_ON_ACCOUNT);
    const sourceRef = `JOURNAL:INVOICE_ISSUED:${order.id}`;
    const entry = await prisma.journalEntry.findUniqueOrThrow({
      where: { sourceRef },
      include: { lines: true },
    });
    for (const line of entry.lines) {
      const debit = line.debit.toFixed(4);
      const credit = line.credit.toFixed(4);
      expect(debit === '99.9999' || debit === '0.0000').toBe(true);
      expect(credit === '99.9999' || credit === '0.0000').toBe(true);
    }
  });
});
