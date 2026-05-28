import { INestApplication } from '@nestjs/common';
import {
  DeliveryStatus,
  PosPaymentMethod,
  SafariRole,
} from '@prisma/client';
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
  buildPosCheckoutLineItemsForTotal,
  createTestApp,
  getAuthHeader,
  getResponseData,
  request,
} from '../helpers';
import { closeDb, prisma, resetDb } from '../setup/test-db';

describe('Order delivery flow (driver + customer)', () => {
  let app: INestApplication<App>;
  let driver: TestUser;
  let otherDriver: TestUser;
  let customerId: string;
  let orderId: string;

  beforeAll(async () => {
    process.env.PAYMENTS_MOCK = 'true';
    process.env.V20_4_FINAL_LEDGER = 'true';
    process.env.V20_3_TRUE_ACCOUNTING = 'true';
    process.env.USE_JOURNAL_AS_SOURCE = 'true';
    process.env.CUSTOMER_OTP_DEV_ECHO = 'true';
    process.env.EXPO_PUSH_MOCK = 'true';
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedJournalAccounts(prisma);
    const branch = await createBranch(prisma);
    driver = await createUser(prisma, SafariRole.DRIVER, branch.id);
    otherDriver = await createUser(prisma, SafariRole.DRIVER, branch.id);
    const customer = await createCustomer(prisma, branch.id, {
      phone: '51112233',
    });
    customerId = customer.id;

    await prisma.customer.update({
      where: { id: customerId },
      data: { expoPushToken: 'ExponentPushToken[delivery-flow]' },
    });

    const checkoutRes = await request(app.getHttpServer())
      .post('/api/pos/checkout')
      .set(getAuthHeader(driver.jwtToken))
      .send({
        customerId,
        customerPhone: customer.phone,
        customerDisplayName: customer.displayName ?? 'Delivery Test',
        customerAddress: customer.address ?? 'Kuwait City',
        totalPrice: '3.0000',
        lineItems: await buildPosCheckoutLineItemsForTotal(prisma, '3.0000'),
        invoiceNumber: `INV-${randomUUID()}`,
        posPaymentMethod: PosPaymentMethod.CASH,
      });
    expect(checkoutRes.status).toBeLessThan(400);
    const checkoutBody = getResponseData<{ id: string }>(checkoutRes.body);
    orderId = checkoutBody.id;
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  async function customerAccessToken(): Promise<string> {
    const req = await request(app.getHttpServer())
      .post('/api/public/customer-auth/request-otp')
      .send({ phone: '51112233' });
    const reqBody = getResponseData<{ devOtpCode?: string }>(req.body);
    const verify = await request(app.getHttpServer())
      .post('/api/public/customer-auth/verify-otp')
      .send({ phone: '51112233', code: reqBody.devOtpCode });
    const session = getResponseData<{ accessToken: string }>(verify.body);
    return session.accessToken;
  }

  it('driver starts delivery → customer sees timeline → complete delivery', async () => {
    const startRes = await request(app.getHttpServer())
      .post(`/api/driver/orders/${orderId}/start-delivery`)
      .set(getAuthHeader(driver.jwtToken))
      .send({});
    expect(startRes.status).toBe(200);
    const started = getResponseData<{ deliveryStatus: DeliveryStatus }>(
      startRes.body,
    );
    expect(started.deliveryStatus).toBe(DeliveryStatus.OUT_FOR_DELIVERY);

    const row = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { deliveryStatus: true, deliveryEvents: true },
    });
    expect(row.deliveryStatus).toBe(DeliveryStatus.OUT_FOR_DELIVERY);
    expect(row.deliveryEvents).toHaveLength(1);

    const token = await customerAccessToken();
    const trackRes = await request(app.getHttpServer())
      .get(`/api/public/customer-portal/orders/${orderId}/delivery`)
      .set('Authorization', `Bearer ${token}`);
    expect(trackRes.status).toBe(200);
    const tracking = getResponseData<{
      deliveryStatus: DeliveryStatus;
      timeline: Array<{ toStatus: DeliveryStatus }>;
    }>(trackRes.body);
    expect(tracking.deliveryStatus).toBe(DeliveryStatus.OUT_FOR_DELIVERY);
    expect(tracking.timeline).toHaveLength(1);

    const completeRes = await request(app.getHttpServer())
      .post(`/api/driver/orders/${orderId}/complete-delivery`)
      .set(getAuthHeader(driver.jwtToken))
      .send({});
    expect(completeRes.status).toBe(200);
    const completed = getResponseData<{ deliveryStatus: DeliveryStatus }>(
      completeRes.body,
    );
    expect(completed.deliveryStatus).toBe(DeliveryStatus.DELIVERED);
  });

  it('return-to-branch records reason and allows retry', async () => {
    await request(app.getHttpServer())
      .post(`/api/driver/orders/${orderId}/start-delivery`)
      .set(getAuthHeader(driver.jwtToken))
      .send({})
      .expect(200);

    const returnRes = await request(app.getHttpServer())
      .post(`/api/driver/orders/${orderId}/return-to-branch`)
      .set(getAuthHeader(driver.jwtToken))
      .send({ reason: 'NO_ANSWER', notes: 'لم يرد على الهاتف' });
    expect(returnRes.status).toBe(200);
    const returned = getResponseData<{ deliveryStatus: DeliveryStatus }>(
      returnRes.body,
    );
    expect(returned.deliveryStatus).toBe(DeliveryStatus.RETURNED_TO_BRANCH);

    const retryRes = await request(app.getHttpServer())
      .post(`/api/driver/orders/${orderId}/start-delivery`)
      .set(getAuthHeader(driver.jwtToken))
      .send({});
    expect(retryRes.status).toBe(200);
    const retried = getResponseData<{ deliveryStatus: DeliveryStatus }>(
      retryRes.body,
    );
    expect(retried.deliveryStatus).toBe(DeliveryStatus.OUT_FOR_DELIVERY);
  });

  it('rejects delivery update from unassigned driver', async () => {
    await prisma.order.update({
      where: { id: orderId },
      data: { driverId: driver.id },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/driver/orders/${orderId}/start-delivery`)
      .set(getAuthHeader(otherDriver.jwtToken))
      .send({});
    expect(res.status).toBe(403);
  });

  it('rejects invalid delivery transition after delivered', async () => {
    await request(app.getHttpServer())
      .post(`/api/driver/orders/${orderId}/start-delivery`)
      .set(getAuthHeader(driver.jwtToken))
      .send({})
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/driver/orders/${orderId}/complete-delivery`)
      .set(getAuthHeader(driver.jwtToken))
      .send({})
      .expect(200);

    const res = await request(app.getHttpServer())
      .post(`/api/driver/orders/${orderId}/start-delivery`)
      .set(getAuthHeader(driver.jwtToken))
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects customer delivery tracking for another customer order', async () => {
    await createCustomer(prisma, null, {
      phone: '52223344',
    });
    const req = await request(app.getHttpServer())
      .post('/api/public/customer-auth/request-otp')
      .send({ phone: '52223344' });
    const reqBody = getResponseData<{ devOtpCode?: string }>(req.body);
    const verify = await request(app.getHttpServer())
      .post('/api/public/customer-auth/verify-otp')
      .send({ phone: '52223344', code: reqBody.devOtpCode });
    const otherToken = getResponseData<{ accessToken: string }>(verify.body)
      .accessToken;

    const res = await request(app.getHttpServer())
      .get(`/api/public/customer-portal/orders/${orderId}/delivery`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });

  it('rejects unauthenticated customer delivery tracking', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/public/customer-portal/orders/${orderId}/delivery`,
    );
    expect(res.status).toBe(401);
  });
});
