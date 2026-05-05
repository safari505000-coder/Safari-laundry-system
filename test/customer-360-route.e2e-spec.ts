import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';

const SAMPLE_CUSTOMER_ID = 'd5d96e5a-b86c-4334-a8cc-7eb85ad4ad81';

/**
 * Proves `GET /api/customers/:id/360` is registered.
 * Requires `DATABASE_URL` (same as other AppModule e2e tests).
 */
describe('Customer 360 HTTP routes (e2e)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let ccToken: string;
  let managerToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    jwt = app.get(JwtService);
    ccToken = await jwt.signAsync({
      sub: '00000000-0000-4000-8000-0000000000cc',
      role: 'CALL_CENTER',
    });
    managerToken = await jwt.signAsync({
      sub: '00000000-0000-4000-8000-0000000000mg',
      role: 'MANAGER',
    });
  });

  afterAll(async () => {
    if (!app) return;
    await app.close().catch((err: unknown) => {
      if (!String(err).includes('Server is not running')) {
        throw err;
      }
    });
  });

  it('GET /api/customers/:id/360 with CALL_CENTER is handled by Nest (not Express "Cannot GET")', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/customers/${SAMPLE_CUSTOMER_ID}/360`)
      .set('Authorization', `Bearer ${ccToken}`);
    expect(res.text).not.toMatch(/Cannot GET/i);
    expect([200, 404]).toContain(res.status);
  });

  it('GET /api/customers/:id/360 with MANAGER → 403', () => {
    return request(app.getHttpServer())
      .get(`/api/customers/${SAMPLE_CUSTOMER_ID}/360`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(403);
  });
});
