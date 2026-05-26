import { INestApplication } from '@nestjs/common';
import { SafariRole } from '@prisma/client';
import { App } from 'supertest/types';
import { createBranch, createUser, TestUser } from '../factories';
import { createTestApp, getAuthHeader, getResponseData, request } from '../helpers';
import { closeDb, prisma, resetDb } from '../setup/test-db';

describe('Public API smoke', () => {
  let app: INestApplication<App>;
  let ccAgent: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    const branch = await createBranch(prisma);
    ccAgent = await createUser(prisma, SafariRole.CALL_CENTER, branch.id);
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  it('serves public catalog without staff authentication', async () => {
    await prisma.laundryItemCategory.create({
      data: { code: 'MAIN', nameAr: 'رئيسي', sortOrder: 1 },
    });
    const category = await prisma.laundryItemCategory.findFirstOrThrow();
    await prisma.laundryPriceListItem.create({
      data: {
        code: 'THOBE',
        nameAr: 'دشداشة',
        priceNormal: '1.0000',
        priceUrgent: '1.5000',
        categoryId: category.id,
      },
    });

    const res = await request(app.getHttpServer()).get('/api/public/catalog');

    const body = getResponseData<{
      brand: {
        phone: string;
        branches: string[];
        colors: { primaryBlue: string };
      };
      services: Array<Record<string, unknown>>;
    }>(res.body);
    expect(res.status).toBe(200);
    expect(body.brand.phone).toBe('22200299');
    expect(body.brand.branches).toContain('سفاري الجهراء');
    expect(body.brand.colors.primaryBlue).toBe('#2D5BEE');
    expect(body.services).toHaveLength(1);
    expect(body.services[0]).toMatchObject({
      code: 'THOBE',
      priceNormalKd: '1.0000',
    });
  });

  it('accepts public order requests without issuing a financial invoice', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/public/orders/request')
      .send({
        customerPhone: '51234567',
        customerDisplayName: 'Public Customer',
        customerAddress: 'Salmiya',
        serviceType: 'NORMAL',
      });

    const body = getResponseData<{ status: string; requestReference: string }>(res.body);
    expect(res.status).toBe(201);
    expect(body.status).toBe('RECEIVED');
    expect(body.requestReference).toMatch(/^W-\d{5}$/);
    expect(await prisma.customer.count()).toBe(1);
    expect(await prisma.websiteOrderRequest.count()).toBe(1);
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.journalEntry.count()).toBe(0);

    const queueRes = await request(app.getHttpServer())
      .get('/api/public/call-center/website-order-requests')
      .set(getAuthHeader(ccAgent.jwtToken));
    const queue = getResponseData<{ requests: Array<{ id: string; status: string }> }>(
      queueRes.body,
    );
    expect(queueRes.status).toBe(200);
    expect(queue.requests).toHaveLength(1);
    expect(queue.requests[0].status).toBe('NEW');
  });
});
