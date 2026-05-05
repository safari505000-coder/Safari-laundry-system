import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';

/**
 * CRM customer directory (`GET /api/customers`) is permission-gated
 * (`VIEW_CUSTOMERS`). Branch managers (`MANAGER`) must not enumerate
 * the tenant-wide directory; OWNER and ACCOUNTANT retain read access.
 */
describe('Customers directory RBAC (e2e)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let managerToken: string;
  let ownerToken: string;
  let accountantToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    jwt = app.get(JwtService);
    managerToken = await jwt.signAsync({
      sub: '00000000-0000-4000-8000-000000000001',
      role: 'MANAGER',
    });
    ownerToken = await jwt.signAsync({
      sub: '00000000-0000-4000-8000-000000000002',
      role: 'OWNER',
    });
    accountantToken = await jwt.signAsync({
      sub: '00000000-0000-4000-8000-000000000003',
      role: 'ACCOUNTANT',
    });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('MANAGER → GET /api/customers → 403', () => {
    return request(app.getHttpServer())
      .get('/api/customers')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(403);
  });

  it('OWNER → GET /api/customers → 200', () => {
    return request(app.getHttpServer())
      .get('/api/customers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
  });

  it('ACCOUNTANT → GET /api/customers → 200', () => {
    return request(app.getHttpServer())
      .get('/api/customers')
      .set('Authorization', `Bearer ${accountantToken}`)
      .expect(200);
  });
});
