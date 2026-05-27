import { INestApplication } from '@nestjs/common';
import { SafariRole } from '@prisma/client';
import { App } from 'supertest/types';
import { createBranch, createUser, TestUser } from '../factories';
import { createTestApp, getAuthHeader, getResponseData, request } from '../helpers';
import { closeDb, prisma, resetDb } from '../setup/test-db';

type PublicOrderBody = {
  status: string;
  requestReference: string;
  requestId: string;
};

type QueueRow = {
  id: string;
  publicReference: string;
  status: string;
  customerPhone: string;
  customerDisplayName: string | null;
  customerAddress: string | null;
  notes: string | null;
  customerId: string | null;
};

describe('Website order requests (public intake + call-center queue)', () => {
  let app: INestApplication<App>;
  let ccAgent: TestUser;
  let ccSupervisor: TestUser;
  let driver: TestUser;

  beforeAll(async () => {
    process.env.EXPO_PUSH_MOCK = 'true';
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    const branch = await createBranch(prisma);
    ccAgent = await createUser(prisma, SafariRole.CALL_CENTER, branch.id);
    ccSupervisor = await createUser(
      prisma,
      SafariRole.CALL_CENTER_SUPERVISOR,
      branch.id,
    );
    driver = await createUser(prisma, SafariRole.DRIVER, branch.id);
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  async function submitPublicOrder(
    overrides: Record<string, unknown> = {},
  ): Promise<PublicOrderBody> {
    const res = await request(app.getHttpServer())
      .post('/api/public/orders/request')
      .send({
        customerPhone: '51234567',
        customerDisplayName: 'Website Customer',
        customerAddress: 'الرقعي',
        serviceType: 'EXPRESS',
        notes: [
          'طريقة الخدمة: مندوب',
          'السرعة: مستعجل',
          'الفرع الأقرب: سفاري الرقعي',
          'الوقت المفضل: 2024-05-21T20:06',
        ].join('\n'),
        ...overrides,
      });

    expect(res.status).toBe(201);
    return getResponseData<PublicOrderBody>(res.body);
  }

  async function listQueue(
    token: string,
    status?: string,
  ): Promise<{ requests: QueueRow[] }> {
    const path =
      status != null
        ? `/api/public/call-center/website-order-requests?status=${status}`
        : '/api/public/call-center/website-order-requests';
    const res = await request(app.getHttpServer())
      .get(path)
      .set(getAuthHeader(token));
    expect(res.status).toBe(200);
    return getResponseData<{ requests: QueueRow[] }>(res.body);
  }

  it('issues sequential W-xxxxx references and persists structured notes', async () => {
    const first = await submitPublicOrder({ customerPhone: '51111111' });
    const second = await submitPublicOrder({ customerPhone: '52222222' });

    expect(first.requestReference).toBe('W-00001');
    expect(second.requestReference).toBe('W-00002');
    expect(first.requestId).toBe(first.requestReference);

    const queue = await listQueue(ccAgent.jwtToken);
    expect(queue.requests).toHaveLength(2);
    expect(queue.requests[0]?.notes).toContain('الوقت المفضل: 2024-05-21T20:06');
    expect(queue.requests[0]?.customerId).toBeTruthy();
    expect(await prisma.order.count()).toBe(0);
  });

  it('filters the queue by status', async () => {
    const created = await submitPublicOrder();
    const queue = await listQueue(ccAgent.jwtToken);
    const row = queue.requests.find(
      (r) => r.publicReference === created.requestReference,
    );
    expect(row).toBeTruthy();

    await request(app.getHttpServer())
      .post(
        `/api/public/call-center/website-order-requests/${row!.id}/status`,
      )
      .set(getAuthHeader(ccAgent.jwtToken))
      .send({ status: 'CONTACTED' })
      .expect(201);

    const newOnly = await listQueue(ccAgent.jwtToken, 'NEW');
    const contactedOnly = await listQueue(ccAgent.jwtToken, 'CONTACTED');

    expect(newOnly.requests).toHaveLength(0);
    expect(contactedOnly.requests).toHaveLength(1);
    expect(contactedOnly.requests[0]?.status).toBe('CONTACTED');
  });

  it('allows call-center roles to update status and records reviewer metadata', async () => {
    const created = await submitPublicOrder();
    const queue = await listQueue(ccSupervisor.jwtToken);
    const row = queue.requests.find(
      (r) => r.publicReference === created.requestReference,
    )!;

    const res = await request(app.getHttpServer())
      .post(
        `/api/public/call-center/website-order-requests/${row.id}/status`,
      )
      .set(getAuthHeader(ccSupervisor.jwtToken))
      .send({ status: 'CONVERTED' });

    const body = getResponseData<{
      id: string;
      publicReference: string;
      status: string;
      reviewedAtIso: string;
    }>(res.body);
    expect(res.status).toBe(201);
    expect(body.status).toBe('CONVERTED');
    expect(body.publicReference).toBe(created.requestReference);
    expect(body.reviewedAtIso).toBeTruthy();

    const stored = await prisma.websiteOrderRequest.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(stored.reviewedByUserId).toBe(ccSupervisor.id);
    expect(stored.status).toBe('CONVERTED');
  });

  it('rejects status updates from non call-center roles', async () => {
    const created = await submitPublicOrder();
    const queue = await listQueue(ccAgent.jwtToken);
    const row = queue.requests[0]!;

    await request(app.getHttpServer())
      .post(
        `/api/public/call-center/website-order-requests/${row.id}/status`,
      )
      .set(getAuthHeader(driver.jwtToken))
      .send({ status: 'CONTACTED' })
      .expect(403);
  });

  it('rejects unauthenticated queue reads', async () => {
    await submitPublicOrder();
    await request(app.getHttpServer())
      .get('/api/public/call-center/website-order-requests')
      .expect(401);
  });

  it('returns 404 when updating an unknown request id', async () => {
    await request(app.getHttpServer())
      .post(
        '/api/public/call-center/website-order-requests/00000000-0000-0000-0000-000000000099/status',
      )
      .set(getAuthHeader(ccAgent.jwtToken))
      .send({ status: 'CANCELLED' })
      .expect(404);
  });

  it('validates status enum on update', async () => {
    const created = await submitPublicOrder();
    const queue = await listQueue(ccAgent.jwtToken);
    const row = queue.requests.find(
      (r) => r.publicReference === created.requestReference,
    )!;

    await request(app.getHttpServer())
      .post(
        `/api/public/call-center/website-order-requests/${row.id}/status`,
      )
      .set(getAuthHeader(ccAgent.jwtToken))
      .send({ status: 'NOT_A_STATUS' })
      .expect(400);
  });

  it('attempts customer expo push when status changes and token exists', async () => {
    const created = await submitPublicOrder({ customerPhone: '55667788' });
    const queue = await listQueue(ccAgent.jwtToken);
    const row = queue.requests.find(
      (r) => r.publicReference === created.requestReference,
    )!;
    expect(row.customerId).toBeTruthy();

    await prisma.customer.update({
      where: { id: row.customerId! },
      data: { expoPushToken: 'ExponentPushToken[website-order-status]' },
    });

    await request(app.getHttpServer())
      .post(
        `/api/public/call-center/website-order-requests/${row.id}/status`,
      )
      .set(getAuthHeader(ccAgent.jwtToken))
      .send({ status: 'CONTACTED' })
      .expect(201);
  });
});
