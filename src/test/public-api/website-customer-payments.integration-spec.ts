import { INestApplication } from '@nestjs/common';
import { PosPaymentMethod, SafariRole } from '@prisma/client';
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
  buildPosCheckoutLineItemsForTotal,
  createTestApp,
  getAuthHeader,
  getResponseData,
  request,
} from '../helpers';
import { closeDb, prisma, resetDb } from '../setup/test-db';

describe('Website customer payments (public pay + call-center queue)', () => {
  let app: INestApplication<App>;
  let branch: Awaited<ReturnType<typeof createBranch>>;
  let driver: TestUser;
  let ccAgent: TestUser;
  let customer: TestCustomer;

  beforeAll(async () => {
    process.env.PAYMENTS_MOCK = 'true';
    process.env.V20_4_FINAL_LEDGER = 'true';
    process.env.V20_3_TRUE_ACCOUNTING = 'true';
    process.env.USE_JOURNAL_AS_SOURCE = 'true';
    app = await createTestApp();
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

  async function createDebtOrder(amountKd = '15.0000') {
    const res = await request(app.getHttpServer())
      .post('/api/pos/checkout')
      .set(getAuthHeader(driver.jwtToken))
      .send({
        customerId: customer.id,
        customerPhone: customer.phone,
        customerDisplayName: customer.displayName ?? 'Website Pay Customer',
        customerAddress: customer.address ?? 'Test Address',
        totalPrice: amountKd,
        lineItems: await buildPosCheckoutLineItemsForTotal(prisma, amountKd),
        invoiceNumber: `INV-${randomUUID()}`,
        posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
      });
    expect(res.status).toBeLessThan(400);
    return getResponseData<{ id: string }>(res.body).id;
  }

  it('creates a hosted payment link from the public website for owned invoices', async () => {
    const orderId = await createDebtOrder();

    const res = await request(app.getHttpServer())
      .post('/api/public/customer-portal/payment-link')
      .send({ customerPhone: customer.phone, orderId });

    const body = getResponseData<{
      orderId: string;
      paymentUrl: string;
      status: string;
      remainingAmountKd: string;
    }>(res.body);
    expect(res.status).toBeLessThan(400);
    expect(body.status).toBe('READY');
    expect(body.paymentUrl).toContain('mock-checkout');
    expect(body.orderId).toBe(orderId);

    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { posHostedPaymentUrl: true, posGatewayMetadata: true },
    });
    expect(stored.posHostedPaymentUrl).toContain('mock-checkout');
    expect(stored.posGatewayMetadata).toMatchObject({
      publicWeb: { phone: customer.phone },
    });
  });

  it('rejects payment-link creation when phone does not own the invoice', async () => {
    const orderId = await createDebtOrder();
    await request(app.getHttpServer())
      .post('/api/public/customer-portal/payment-link')
      .send({ customerPhone: '59999999', orderId })
      .expect(403);
  });

  it('creates a balance payment link from visible customer debt', async () => {
    await createDebtOrder('14.5000');

    const res = await request(app.getHttpServer())
      .post('/api/public/customer-portal/pay-balance')
      .send({ customerPhone: customer.phone });

    const body = getResponseData<{
      paymentUrl: string;
      status: string;
      remainingAmountKd: string;
    }>(res.body);
    expect(res.status).toBeLessThan(400);
    expect(body.status).toBe('READY');
    expect(body.paymentUrl).toContain('mock-checkout');
    expect(Number(body.remainingAmountKd)).toBeGreaterThan(0);
  });

  it('lists website-initiated payments for call-center staff', async () => {
    const orderId = await createDebtOrder();
    await request(app.getHttpServer())
      .post('/api/public/customer-portal/payment-link')
      .send({ customerPhone: customer.phone, orderId });

    const queueRes = await request(app.getHttpServer())
      .get('/api/public/call-center/website-payments?status=PENDING')
      .set(getAuthHeader(ccAgent.jwtToken));
    const queue = getResponseData<{
      payments: Array<{ orderId: string; paymentUrl: string | null }>;
    }>(queueRes.body);
    expect(queueRes.status).toBe(200);
    expect(queue.payments).toHaveLength(1);
    expect(queue.payments[0]?.orderId).toBe(orderId);
    expect(queue.payments[0]?.paymentUrl).toBeTruthy();
  });
});
