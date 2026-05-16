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
import { createTestApp, getAuthHeader, getResponseData, request } from '../helpers';
import { closeDb, prisma, resetDb } from '../setup/test-db';

describe('RBAC: Branch IDOR Prevention', () => {
  let app: INestApplication<App>;
  let branch1: Awaited<ReturnType<typeof createBranch>>;
  let branch2: Awaited<ReturnType<typeof createBranch>>;
  let driver1: TestUser;
  let driver2: TestUser;
  let ccBranch1: TestUser;
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
    driver1 = await createUser(prisma, SafariRole.DRIVER, branch1.id);
    driver2 = await createUser(prisma, SafariRole.DRIVER, branch2.id);
    ccBranch1 = await createUser(prisma, SafariRole.CALL_CENTER, branch1.id);
    customer2 = await createCustomer(prisma, branch2.id);
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
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
        totalPrice: 25,
        invoiceNumber: `INV-${randomUUID()}`,
        posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
      });
    expect(checkout.status).toBeLessThan(400);
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: getResponseData<{ id: string }>(checkout.body).id },
    });

    const denied = await request(app.getHttpServer())
      .post(`/api/call-center/orders/${order.id}/mark-paid`)
      .set(getAuthHeader(ccBranch1.jwtToken))
      .send({ paymentMethod: 'CASH' });

    expect([403, 404]).toContain(denied.status);
  });

  it('driver from branch1 cannot read another driver order detail directly', async () => {
    const otherCheckout = await request(app.getHttpServer())
      .post('/api/pos/checkout')
      .set(getAuthHeader(driver2.jwtToken))
      .send({
        customerId: customer2.id,
        customerPhone: customer2.phone,
        customerDisplayName: customer2.displayName ?? 'Test',
        customerAddress: customer2.address ?? 'Test',
        totalPrice: 12,
        invoiceNumber: `INV-${randomUUID()}`,
        posPaymentMethod: PosPaymentMethod.CASH,
      });
    expect(otherCheckout.status).toBeLessThan(400);
    const otherOrderId = getResponseData<{ id: string }>(otherCheckout.body).id;

    const denied = await request(app.getHttpServer())
      .get(`/api/orders/${otherOrderId}`)
      .set(getAuthHeader(driver1.jwtToken));

    expect([403, 404]).toContain(denied.status);
  });

  it('driver list endpoint scopes to own driver rows only', async () => {
    await request(app.getHttpServer())
      .post('/api/pos/checkout')
      .set(getAuthHeader(driver2.jwtToken))
      .send({
        customerId: customer2.id,
        customerPhone: customer2.phone,
        customerDisplayName: customer2.displayName ?? 'Test',
        customerAddress: customer2.address ?? 'Test',
        totalPrice: 9,
        invoiceNumber: `INV-${randomUUID()}`,
        posPaymentMethod: PosPaymentMethod.CASH,
      });

    const list = await request(app.getHttpServer())
      .get('/api/orders/driver/pending-invoices')
      .set(getAuthHeader(driver1.jwtToken));

    if (list.status === 200) {
      const response = getResponseData<{
        rows?: Array<{ driverId?: string }>;
      }>(list.body);
      const rows = response.rows ?? [];
      for (const row of rows) {
        if (row.driverId) {
          expect(row.driverId).toBe(driver1.id);
        }
      }
    } else {
      expect([200, 403]).toContain(list.status);
    }
  });

  it('customer-portal user with linkedCustomerId X cannot read customer Y', async () => {
    const customerY = await createCustomer(prisma, branch1.id);
    const portalUser = await createUser(
      prisma,
      SafariRole.CUSTOMER,
      branch1.id,
      { linkedCustomer: { connect: { id: customer2.id } } },
    );

    const res = await request(app.getHttpServer())
      .get(`/api/customers/${customerY.id}/360`)
      .set(getAuthHeader(portalUser.jwtToken));

    expect([403, 404]).toContain(res.status);
  });
});
