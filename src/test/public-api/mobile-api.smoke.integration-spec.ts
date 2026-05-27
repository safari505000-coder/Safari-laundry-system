import { INestApplication } from '@nestjs/common';
import { PosPaymentMethod, SafariRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { App } from 'supertest/types';
import {
  createBranch,
  createCustomer,
  createUser,
  seedJournalAccounts,
  TestUser,
} from '../factories';
import {
  createTestApp,
  getAuthHeader,
  getResponseData,
  request,
} from '../helpers';
import { closeDb, prisma, resetDb } from '../setup/test-db';

describe('Mobile API smoke (employee + customer)', () => {
  let app: INestApplication<App>;
  let driver: TestUser;

  beforeAll(async () => {
    process.env.PAYMENTS_MOCK = 'true';
    process.env.V20_4_FINAL_LEDGER = 'true';
    process.env.V20_3_TRUE_ACCOUNTING = 'true';
    process.env.USE_JOURNAL_AS_SOURCE = 'true';
    process.env.CUSTOMER_OTP_DEV_ECHO = 'true';
    process.env.PUBLIC_CUSTOMER_PORTAL_PHONE_PREVIEW = 'true';
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    const branch = await createBranch(prisma);
    driver = await createUser(prisma, SafariRole.DRIVER, branch.id);
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  it('lets a driver upload GPS via PATCH /finance/driver/location', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/finance/driver/location')
      .set(getAuthHeader(driver.jwtToken))
      .send({ lastKnownLocation: '29.3759,47.9774' });

    expect(res.status).toBe(200);
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: driver.id },
      select: { lastKnownLocation: true },
    });
    expect(row.lastKnownLocation).toBe('29.3759,47.9774');
  });

  it('rejects invalid GPS coordinates', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/finance/driver/location')
      .set(getAuthHeader(driver.jwtToken))
      .send({ lastKnownLocation: 'not-coords' });

    expect(res.status).toBe(400);
  });

  it('registers staff expo push token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/public/employee/push-token')
      .set(getAuthHeader(driver.jwtToken))
      .send({ token: 'ExponentPushToken[smoke-test]', platform: 'android' });

    expect([200, 201]).toContain(res.status);
    const body = getResponseData<{ ok: boolean }>(res.body);
    expect(body.ok).toBe(true);

    const row = await prisma.user.findUniqueOrThrow({
      where: { id: driver.id },
      select: { expoPushToken: true },
    });
    expect(row.expoPushToken).toBe('ExponentPushToken[smoke-test]');
  });

  it('returns customer portal preview by phone without staff JWT', async () => {
    await seedJournalAccounts(prisma);
    const branch = await createBranch(prisma);
    const customer = await createCustomer(prisma, branch.id, { phone: '51234567' });

    const checkoutRes = await request(app.getHttpServer())
      .post('/api/pos/checkout')
      .set(getAuthHeader(driver.jwtToken))
      .send({
        customerId: customer.id,
        customerPhone: customer.phone,
        customerDisplayName: customer.displayName ?? 'Portal Smoke Customer',
        customerAddress: customer.address ?? 'Test Address',
        totalPrice: '2.5000',
        invoiceNumber: `INV-${randomUUID()}`,
        posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
      });
    expect(checkoutRes.status).toBeLessThan(400);

    const res = await request(app.getHttpServer()).get(
      '/api/public/customer-portal?phone=51234567',
    );

    const body = getResponseData<{
      customer: { id: string; phone: string };
      recentOrders: Array<{ remainingAmountKd: string }>;
    }>(res.body);
    expect(res.status).toBe(200);
    expect(body.customer.phone).toBe('51234567');
    expect(body.recentOrders.length).toBeGreaterThanOrEqual(1);
    expect(body.recentOrders[0].remainingAmountKd).toMatch(/^\d+\.\d{4}$/);
    expect(Number(body.recentOrders[0].remainingAmountKd)).toBeGreaterThan(0);
  });

  it('returns OTP envelope and verifies into customer portal JWT', async () => {
    await createCustomer(prisma, null, { phone: '52345678' });

    const req = await request(app.getHttpServer())
      .post('/api/public/customer-auth/request-otp')
      .send({ phone: '52345678' });

    const reqBody = getResponseData<{
      status: string;
      devOtpCode?: string;
    }>(req.body);
    expect(req.status).toBeLessThan(400);
    expect(reqBody.devOtpCode).toMatch(/^\d{6}$/);

    const verify = await request(app.getHttpServer())
      .post('/api/public/customer-auth/verify-otp')
      .send({ phone: '52345678', code: reqBody.devOtpCode });

    const session = getResponseData<{
      status: string;
      accessToken: string;
      customer: { id: string; phone: string };
    }>(verify.body);
    expect(verify.status).toBeLessThan(400);
    expect(session.status).toBe('VERIFIED');
    expect(session.accessToken).toBeTruthy();

    const portal = await request(app.getHttpServer())
      .get('/api/public/customer-portal/me')
      .set('Authorization', `Bearer ${session.accessToken}`);

    const portalBody = getResponseData<{
      customer: { phone: string };
    }>(portal.body);
    expect(portal.status).toBe(200);
    expect(portalBody.customer.phone).toBe('52345678');
  });

  it('lists website order requests by customer phone', async () => {
    await request(app.getHttpServer())
      .post('/api/public/orders/request')
      .send({
        customerPhone: '53456789',
        customerDisplayName: 'Track Me',
        serviceType: 'EXPRESS',
        notes: 'Smoke track test',
      })
      .expect((res) => expect(res.status).toBeLessThan(400));

    const res = await request(app.getHttpServer()).get(
      '/api/public/orders/requests?phone=53456789',
    );

    const body = getResponseData<{
      requests: Array<{
        publicReference: string;
        status: string;
        notes: string | null;
      }>;
    }>(res.body);
    expect(res.status).toBe(200);
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0]?.publicReference).toMatch(/^W-\d{5}$/);
    expect(body.requests[0]?.status).toBe('NEW');
    expect(body.requests[0]?.notes).toBe('Smoke track test');
  });

  it('registers customer expo push token by phone', async () => {
    const customer = await createCustomer(prisma, null, { phone: '54567890' });

    const res = await request(app.getHttpServer())
      .post('/api/public/customer/push-token')
      .send({
        customerPhone: customer.phone,
        token: 'ExponentPushToken[customer-smoke]',
        platform: 'android',
      });

    expect([200, 201]).toContain(res.status);
    const body = getResponseData<{ ok: boolean }>(res.body);
    expect(body.ok).toBe(true);

    const row = await prisma.customer.findUniqueOrThrow({
      where: { id: customer.id },
      select: { expoPushToken: true },
    });
    expect(row.expoPushToken).toBe('ExponentPushToken[customer-smoke]');
  });
});
