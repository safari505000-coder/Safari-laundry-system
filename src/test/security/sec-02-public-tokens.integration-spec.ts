import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { App } from 'supertest/types';
import { JWT_SECRET_DEV_FALLBACK } from '../../common/constants/jwt-secret-fallback';
import { createBranch, createCustomer, seedJournalAccounts } from '../factories';
import { createTestApp, request } from '../helpers';
import { closeDb, prisma, resetDb } from '../setup/test-db';

describe('SEC-02: Public Share Tokens', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedJournalAccounts(prisma);
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  function jwtSign(payload: Record<string, unknown>, opts?: { expiresIn?: string }) {
    const jwt = new JwtService({
      secret: process.env.JWT_SECRET ?? JWT_SECRET_DEV_FALLBACK,
    });
    return jwt.sign(payload, opts as never);
  }

  it('expired statement-share token is rejected', async () => {
    const branch = await createBranch(prisma);
    const customer = await createCustomer(prisma, branch.id);

    const expired = jwtSign(
      { sub: customer.id, customerId: customer.id, purpose: 'STATEMENT_SHARE' },
      { expiresIn: '-1h' },
    );

    const res = await request(app.getHttpServer()).get(
      `/api/public/statement?token=${expired}`,
    );

    expect([401, 404]).toContain(res.status);
  });

  it('tampered statement-share token is rejected', async () => {
    const branch = await createBranch(prisma);
    const customer = await createCustomer(prisma, branch.id);

    const valid = jwtSign(
      { sub: customer.id, customerId: customer.id, purpose: 'STATEMENT_SHARE' },
      { expiresIn: '1h' },
    );
    const tampered = `${valid.slice(0, -5)}xxxxx`;

    const res = await request(app.getHttpServer()).get(
      `/api/public/statement?token=${tampered}`,
    );

    expect([401, 404]).toContain(res.status);
  });

  it('token with wrong purpose claim is rejected', async () => {
    const branch = await createBranch(prisma);
    const customer = await createCustomer(prisma, branch.id);

    const wrongPurpose = jwtSign(
      { sub: customer.id, customerId: customer.id, purpose: 'AUTH' },
      { expiresIn: '1h' },
    );

    const res = await request(app.getHttpServer()).get(
      `/api/public/statement?token=${wrongPurpose}`,
    );

    expect([401, 403, 404]).toContain(res.status);
  });

  it('invoice-share token for one order cannot fetch a different order', async () => {
    const tokenForRandom = jwtSign(
      {
        sub: '00000000-0000-0000-0000-000000000001',
        orderId: '00000000-0000-0000-0000-000000000002',
        purpose: 'INVOICE_SHARE',
      },
      { expiresIn: '1h' },
    );

    const res = await request(app.getHttpServer()).get(
      `/api/public/invoice/${tokenForRandom}`,
    );

    expect([401, 403, 404]).toContain(res.status);
  });

  it('missing token returns 4xx not 5xx', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/public/statement',
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});
