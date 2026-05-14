import { INestApplication } from '@nestjs/common';
import { SafariRole } from '@prisma/client';
import { App } from 'supertest/types';
import { createBranch, createUser, seedJournalAccounts, TestUser } from '../factories';
import { createTestApp, getAuthHeader, request } from '../helpers';
import { closeDb, prisma, resetDb } from '../setup/test-db';

type Method = 'get' | 'post' | 'patch' | 'delete';

interface EndpointSpec {
  method: Method;
  path: string;
  allowed: SafariRole[];
}

const ALL_ROLES: SafariRole[] = [
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.MANAGER,
  SafariRole.DRIVER,
  SafariRole.WORKER,
  SafariRole.CALL_CENTER,
  SafariRole.CALL_CENTER_SUPERVISOR,
  SafariRole.FLEET_SUPERVISOR,
  SafariRole.ACCOUNTANT,
  SafariRole.SUPERVISOR,
  SafariRole.VIEWER,
  SafariRole.CUSTOMER,
];

const ENDPOINTS: EndpointSpec[] = [
  {
    method: 'get',
    path: '/api/finance/outstanding',
    allowed: [
      SafariRole.OWNER,
      SafariRole.GENERAL_MANAGER,
      SafariRole.ACCOUNTANT,
      SafariRole.CALL_CENTER,
      SafariRole.CALL_CENTER_SUPERVISOR,
    ],
  },
  {
    method: 'get',
    path: '/api/payroll',
    allowed: [SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT],
  },
  {
    method: 'post',
    path: '/api/call-center/subscriptions/activate',
    allowed: [SafariRole.CALL_CENTER, SafariRole.CALL_CENTER_SUPERVISOR],
  },
  {
    method: 'get',
    path: '/api/finance/periods',
    allowed: [SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT],
  },
  {
    method: 'post',
    path: '/api/finance/periods/close',
    allowed: [SafariRole.OWNER, SafariRole.ACCOUNTANT],
  },
];

describe('RBAC Matrix', () => {
  let app: INestApplication<App>;
  let users: Map<SafariRole, TestUser>;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb();
    await seedJournalAccounts(prisma);
    const branch = await createBranch(prisma);
    users = new Map();
    for (const role of ALL_ROLES) {
      const u = await createUser(prisma, role, branch.id);
      users.set(role, u);
    }
  });

  afterAll(async () => {
    await closeDb();
    await app.close();
  });

  for (const endpoint of ENDPOINTS) {
    describe(`${endpoint.method.toUpperCase()} ${endpoint.path}`, () => {
      for (const role of ALL_ROLES) {
        const shouldAllow = endpoint.allowed.includes(role);
        const verb = shouldAllow ? 'permits' : 'denies';
        it(`${verb} ${role}`, async () => {
          const user = users.get(role);
          if (!user) throw new Error(`No seeded user for role ${role}`);

          const req = request(app.getHttpServer())
            [endpoint.method](endpoint.path)
            .set(getAuthHeader(user.jwtToken));

          if (endpoint.method !== 'get') {
            req.send({});
          }

          const res = await req;

          if (shouldAllow) {
            expect(res.status).not.toBe(403);
          } else {
            expect(res.status).toBe(403);
          }
        });
      }
    });
  }
});
