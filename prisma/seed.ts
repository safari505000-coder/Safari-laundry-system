/**
 * Safari Fast Group — corporate database seed.
 *
 * RBAC (institutional):
 * - OWNER: full system access
 * - MANAGER: operational access (includes management reports)
 * - SUPERVISOR: same permission surface as manager (oversight / مراقب)
 * - ACCOUNTANT: finance-oriented reads (محاسب)
 * - VIEWER: read-only dashboards (عارض)
 * - DRIVER: service delivery access
 *
 * Bootstrap OWNER credentials are fixed for this environment:
 *   username: admin
 *   password: admin
 * Optional CALL_CENTER user:
 *   SEED_CALL_CENTER_USERNAME, SEED_CALL_CENTER_PASSWORD, SEED_CALL_CENTER_FULL_NAME
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { Pool } from 'pg';
import { AccountType, PrismaClient, SafariRole } from '@prisma/client';
import { CANONICAL_PAYMENT_METHOD_FEE_CONFIG } from '../src/payment-method-fees/canonical-payment-fee-config';
import {
  ACCOUNTANT_PERMISSION_KEYS,
  ALL_PERMISSION_KEYS,
  CALL_CENTER_PERMISSION_KEYS,
  DRIVER_PERMISSION_KEYS,
  MANAGER_PERMISSION_KEYS,
  SUPERVISOR_PERMISSION_KEYS,
  VIEWER_PERMISSION_KEYS,
} from './permission-seeds';
import { seedLaundryPriceList } from './price-list-seed';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin';
const ADMIN_FULL_NAME = 'System Administrator';

const CALL_CENTER_USERNAME = process.env.SEED_CALL_CENTER_USERNAME?.trim();
const CALL_CENTER_PASSWORD =
  process.env.SEED_CALL_CENTER_PASSWORD ?? 'ChangeMe123!';
const CALL_CENTER_FULL_NAME =
  process.env.SEED_CALL_CENTER_FULL_NAME ?? 'Call Center Agent';

/**
 * V19.x — PASSWORD RESET BUG FIX (post-mortem in CHANGELOG).
 *
 * BACKGROUND
 *   `package.json` runs `npx prisma db seed` on every `npm start`.
 *   The earlier upserts below carried `password: passwordHash` in
 *   their `update` branch, which silently overwrote whatever
 *   password the Owner had set through the Users page on every
 *   single restart. Users reported "كلمة سر admin ترجع admin
 *   لحالها".
 *
 * FIX
 *   - In production (`NODE_ENV=production`) the seed NEVER touches
 *     `password`, period. The bootstrap admin is created with
 *     `'admin'` only when no admin row exists at all (the `create`
 *     branch); after that, the Owner's chosen password is the only
 *     truth.
 *   - In development the seed still resets `password` so a fresh
 *     `prisma migrate reset` brings the well-known credentials back.
 *
 * Also enforces that the admin row's `safariRole` + `roleId` cannot
 * be downgraded by accident — those are institutional invariants,
 * not user preferences, so the seed re-asserts them on every run
 * regardless of environment.
 */
const SEED_RESET_PASSWORDS = process.env.NODE_ENV !== 'production';

async function main(): Promise<void> {
  const chartOfAccounts = [
    { code: '1100', name: 'CASH', type: AccountType.ASSET },
    { code: '1200', name: 'BANK_KNET', type: AccountType.ASSET },
    { code: '1210', name: 'BANK_ONLINE', type: AccountType.ASSET },
    { code: '1300', name: 'ACCOUNTS_RECEIVABLE', type: AccountType.ASSET },
    { code: '4100', name: 'REVENUE', type: AccountType.REVENUE },
    { code: '5100', name: 'ADJUSTMENTS', type: AccountType.EXPENSE },
  ] as const;

  for (const account of chartOfAccounts) {
    await prisma.account.upsert({
      where: { code: account.code },
      create: account,
      update: {
        name: account.name,
        type: account.type,
        isActive: true,
      },
    });
  }
  console.info('Ensured double-entry chart of accounts.');

  for (const key of ALL_PERMISSION_KEYS) {
    await prisma.permission.upsert({
      where: { key },
      create: { key },
      update: {},
    });
  }

  const allPermissions = await prisma.permission.findMany();

  await prisma.role.upsert({
    where: { name: SafariRole.OWNER },
    create: {
      name: SafariRole.OWNER,
      permissions: { connect: ALL_PERMISSION_KEYS.map((key) => ({ key })) },
    },
    update: {
      permissions: {
        set: allPermissions.map((p) => ({ id: p.id })),
      },
    },
  });

  const managerPermissions = await prisma.permission.findMany({
    where: { key: { in: [...MANAGER_PERMISSION_KEYS] } },
  });

  await prisma.role.upsert({
    where: { name: SafariRole.MANAGER },
    create: {
      name: SafariRole.MANAGER,
      permissions: { connect: managerPermissions.map((p) => ({ id: p.id })) },
    },
    update: {
      permissions: {
        set: managerPermissions.map((p) => ({ id: p.id })),
      },
    },
  });

  const driverPermissions = await prisma.permission.findMany({
    where: { key: { in: [...DRIVER_PERMISSION_KEYS] } },
  });

  await prisma.role.upsert({
    where: { name: SafariRole.DRIVER },
    create: {
      name: SafariRole.DRIVER,
      permissions: { connect: driverPermissions.map((p) => ({ id: p.id })) },
    },
    update: {
      permissions: {
        set: driverPermissions.map((p) => ({ id: p.id })),
      },
    },
  });

  await prisma.role.upsert({
    where: { name: SafariRole.WORKER },
    create: {
      name: SafariRole.WORKER,
      permissions: { connect: driverPermissions.map((p) => ({ id: p.id })) },
    },
    update: {
      permissions: {
        set: driverPermissions.map((p) => ({ id: p.id })),
      },
    },
  });

  const callCenterPermissions = await prisma.permission.findMany({
    where: { key: { in: [...CALL_CENTER_PERMISSION_KEYS] } },
  });

  await prisma.role.upsert({
    where: { name: SafariRole.CALL_CENTER },
    create: {
      name: SafariRole.CALL_CENTER,
      permissions: {
        connect: callCenterPermissions.map((p) => ({ id: p.id })),
      },
    },
    update: {
      permissions: {
        set: callCenterPermissions.map((p) => ({ id: p.id })),
      },
    },
  });

  // V19.9 — CALL_CENTER_SUPERVISOR inherits the full CC permission set.
  // Supervisor-only capabilities (invoice edit/void, team reports) are
  // gated by SafariRole in @Roles() decorators rather than in the
  // permission table, so we can safely share the CC permission bundle.
  await prisma.role.upsert({
    where: { name: SafariRole.CALL_CENTER_SUPERVISOR },
    create: {
      name: SafariRole.CALL_CENTER_SUPERVISOR,
      permissions: {
        connect: callCenterPermissions.map((p) => ({ id: p.id })),
      },
    },
    update: {
      permissions: {
        set: callCenterPermissions.map((p) => ({ id: p.id })),
      },
    },
  });

  // V19.10 — FLEET_SUPERVISOR (مسؤول السيارات). Permission-table access
  // is intentionally minimal — this rank is scoped to /api/vehicle-expenses
  // and the cross-cutting rails (branch:read, wallet:read, audit:read)
  // that the sidebar pages rely on. Route-level RBAC lives in the
  // controller via @Roles(FLEET_SUPERVISOR).
  const fleetSupervisorPermissions = await prisma.permission.findMany({
    where: { key: { in: ['branch:read', 'wallet:read', 'audit:read'] } },
  });
  await prisma.role.upsert({
    where: { name: SafariRole.FLEET_SUPERVISOR },
    create: {
      name: SafariRole.FLEET_SUPERVISOR,
      permissions: {
        connect: fleetSupervisorPermissions.map((p) => ({ id: p.id })),
      },
    },
    update: {
      permissions: {
        set: fleetSupervisorPermissions.map((p) => ({ id: p.id })),
      },
    },
  });

  const accountantPermissions = await prisma.permission.findMany({
    where: { key: { in: [...ACCOUNTANT_PERMISSION_KEYS] } },
  });

  await prisma.role.upsert({
    where: { name: SafariRole.ACCOUNTANT },
    create: {
      name: SafariRole.ACCOUNTANT,
      permissions: {
        connect: accountantPermissions.map((p) => ({ id: p.id })),
      },
    },
    update: {
      permissions: {
        set: accountantPermissions.map((p) => ({ id: p.id })),
      },
    },
  });

  const supervisorPermissions = await prisma.permission.findMany({
    where: { key: { in: [...SUPERVISOR_PERMISSION_KEYS] } },
  });

  await prisma.role.upsert({
    where: { name: SafariRole.SUPERVISOR },
    create: {
      name: SafariRole.SUPERVISOR,
      permissions: {
        connect: supervisorPermissions.map((p) => ({ id: p.id })),
      },
    },
    update: {
      permissions: {
        set: supervisorPermissions.map((p) => ({ id: p.id })),
      },
    },
  });

  const viewerPermissions = await prisma.permission.findMany({
    where: { key: { in: [...VIEWER_PERMISSION_KEYS] } },
  });

  await prisma.role.upsert({
    where: { name: SafariRole.VIEWER },
    create: {
      name: SafariRole.VIEWER,
      permissions: {
        connect: viewerPermissions.map((p) => ({ id: p.id })),
      },
    },
    update: {
      permissions: {
        set: viewerPermissions.map((p) => ({ id: p.id })),
      },
    },
  });

  const customerPortalPermissions = await prisma.permission.findMany({
    where: { key: { in: ['customer:read', 'customer:search'] } },
  });

  await prisma.role.upsert({
    where: { name: SafariRole.CUSTOMER },
    create: {
      name: SafariRole.CUSTOMER,
      permissions: {
        connect: customerPortalPermissions.map((p) => ({ id: p.id })),
      },
    },
    update: {
      permissions: {
        set: customerPortalPermissions.map((p) => ({ id: p.id })),
      },
    },
  });

  const ownerRole = await prisma.role.findUniqueOrThrow({
    where: { name: SafariRole.OWNER },
  });

  const callCenterRole = await prisma.role.findUniqueOrThrow({
    where: { name: SafariRole.CALL_CENTER },
  });

  const adminTaken = await prisma.user.findUnique({
    where: { username: ADMIN_USERNAME },
  });
  if (!adminTaken) {
    const legacyOwner = await prisma.user.findFirst({
      where: { username: 'owner' },
    });
    if (legacyOwner) {
      await prisma.user.update({
        where: { id: legacyOwner.id },
        data: { username: ADMIN_USERNAME, fullName: ADMIN_FULL_NAME },
      });
    }
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  await prisma.user.upsert({
    where: { username: ADMIN_USERNAME },
    create: {
      username: ADMIN_USERNAME,
      fullName: ADMIN_FULL_NAME,
      password: passwordHash,
      safariRole: SafariRole.OWNER,
      roleId: ownerRole.id,
    },
    update: {
      // Production: NEVER overwrite the Owner's chosen password.
      // Dev: spread reapplies the seed credentials so a fresh DB
      // boots with the well-known admin/admin combination.
      ...(SEED_RESET_PASSWORDS ? { password: passwordHash } : {}),
      // Institutional invariants — re-asserted unconditionally so
      // an accidental role downgrade is healed on the next boot.
      safariRole: SafariRole.OWNER,
      roleId: ownerRole.id,
    },
  });

  if (CALL_CENTER_USERNAME) {
    const ccHash = await bcrypt.hash(CALL_CENTER_PASSWORD, 12);
    await prisma.user.upsert({
      where: { username: CALL_CENTER_USERNAME },
      create: {
        username: CALL_CENTER_USERNAME,
        fullName: CALL_CENTER_FULL_NAME,
        password: ccHash,
        safariRole: SafariRole.CALL_CENTER,
        roleId: callCenterRole.id,
      },
      update: {
        // Same rule as the admin upsert: never reset the password
        // in production. The agent's own password change from the
        // Users page must outlive every restart.
        ...(SEED_RESET_PASSWORDS ? { password: ccHash } : {}),
        safariRole: SafariRole.CALL_CENTER,
        roleId: callCenterRole.id,
      },
    });
    console.info(
      `Seeded CALL_CENTER user: ${CALL_CENTER_USERNAME}` +
        (SEED_RESET_PASSWORDS
          ? ' (password re-applied — dev mode)'
          : ' (password preserved — production safe-guard)'),
    );
  }

  const forceCanonicalFees =
    (process.env.SEED_FORCE_CANONICAL_FEES ?? '').toLowerCase() === 'true';
  await prisma.paymentMethodFeeConfig.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      ...CANONICAL_PAYMENT_METHOD_FEE_CONFIG,
    },
    update: forceCanonicalFees ? { ...CANONICAL_PAYMENT_METHOD_FEE_CONFIG } : {},
  });
  console.info(
    `Ensured payment-method fee config (V8.5 bank commission)${forceCanonicalFees ? ' — canonical values reapplied' : ''}.`,
  );

  await seedLaundryPriceList(prisma);
  console.info('Seeded laundry price list (PDF tariff).');

  console.info(
    SEED_RESET_PASSWORDS
      ? `Corporate seed complete — DEV mode. OWNER login is "${ADMIN_USERNAME}" / "${ADMIN_PASSWORD}" (password re-applied this run).`
      : `Corporate seed complete — PRODUCTION mode. OWNER row reaffirmed; existing password PRESERVED.`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
