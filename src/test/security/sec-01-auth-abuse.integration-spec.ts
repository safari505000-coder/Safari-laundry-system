import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SafariRole } from '@prisma/client';
import { App } from 'supertest/types';
import { JWT_SECRET_DEV_FALLBACK } from '../../common/constants/jwt-secret-fallback';
import { createBranch, createUser, TestUser } from '../factories';
import { createTestApp, getAuthHeader, request } from '../helpers';
import { closeDb, prisma, resetDb } from '../setup/test-db';

describe('SEC-01: Authentication Abuse', () => {
  let app: INestApplication<App>;
  let owner: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    const branch = await createBranch(prisma);
    owner = await createUser(prisma, SafariRole.OWNER, branch.id);
  });

  afterAll(async () => {
    await closeDb();
    await app.close();
  });

  it('login brute-force is rate-limited (5 per IP per minute)', async () => {
    const attempts: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'no-such-user', password: 'wrong-password' });
      attempts.push(res.status);
    }
    const tooManyRequests = attempts.filter((s) => s === 429);
    expect(tooManyRequests.length).toBeGreaterThan(0);
  });

  it('expired JWT is rejected with 401', async () => {
    const jwt = new JwtService({
      secret: process.env.JWT_SECRET ?? JWT_SECRET_DEV_FALLBACK,
    });
    const expiredToken = jwt.sign(
      {
        sub: owner.id,
        role: owner.safariRole,
        branchId: owner.branchId,
      },
      { expiresIn: '-1h' },
    );

    const res = await request(app.getHttpServer())
      .get('/api/finance/periods')
      .set(getAuthHeader(expiredToken));

    expect(res.status).toBe(401);
  });

  it('tampered JWT is rejected with 401', async () => {
    const tampered = `${owner.jwtToken.slice(0, -5)}xxxxx`;
    const res = await request(app.getHttpServer())
      .get('/api/finance/periods')
      .set(getAuthHeader(tampered));

    expect(res.status).toBe(401);
  });

  it('JWT signed with wrong secret is rejected with 401', async () => {
    const wrongSecretJwt = new JwtService({ secret: 'wrong-secret-not-real' });
    const token = wrongSecretJwt.sign({
      sub: owner.id,
      role: owner.safariRole,
    });

    const res = await request(app.getHttpServer())
      .get('/api/finance/periods')
      .set(getAuthHeader(token));

    expect(res.status).toBe(401);
  });

  it('missing Authorization header returns 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/finance/periods');
    expect(res.status).toBe(401);
  });
});
