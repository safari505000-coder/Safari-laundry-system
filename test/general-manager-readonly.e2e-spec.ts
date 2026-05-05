import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';

describe('GENERAL_MANAGER read-only (e2e)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let gmToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    jwt = app.get(JwtService);
    gmToken = await jwt.signAsync({
      sub: '00000000-0000-4000-8000-000000000099',
      role: 'GENERAL_MANAGER',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const range = {
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-01-02T23:59:59.999Z',
  };

  it('allows GET /api/finance/reports/cash-reconciliation', () => {
    return request(app.getHttpServer())
      .get('/api/finance/reports/cash-reconciliation')
      .query(range)
      .set('Authorization', `Bearer ${gmToken}`)
      .expect(200)
      .expect((res) => {
        const body = res.body as {
          eventBasedInRange: { collectedKd: string };
          stateBasedNow: { pendingWithDriversKd: string };
        };
        expect(body.eventBasedInRange).toBeDefined();
        expect(body.stateBasedNow).toBeDefined();
      });
  });

  it('allows GET /api/subscription-plans', () => {
    return request(app.getHttpServer())
      .get('/api/subscription-plans')
      .set('Authorization', `Bearer ${gmToken}`)
      .expect(200);
  });

  it('blocks POST /api/subscription-plans (read-only guard)', () => {
    return request(app.getHttpServer())
      .post('/api/subscription-plans')
      .set('Authorization', `Bearer ${gmToken}`)
      .send({ name: 'x', listPriceKd: 1, walletCreditKd: 1 })
      .expect(403);
  });

  it('blocks PATCH /api/users/:id/status even for OWNER-only route', () => {
    return request(app.getHttpServer())
      .patch(
        `/api/users/00000000-0000-4000-8000-000000000099/status`,
      )
      .set('Authorization', `Bearer ${gmToken}`)
      .send({ isActive: false })
      .expect(403);
  });

  it('blocks PATCH /api/finance/deposits/:id/status', () => {
    return request(app.getHttpServer())
      .patch(
        `/api/finance/deposits/00000000-0000-4000-8000-000000000088/status`,
      )
      .set('Authorization', `Bearer ${gmToken}`)
      .send({ status: 'APPROVED' })
      .expect(403);
  });
});
