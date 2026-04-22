/**
 * Load-test seed — creates isolated, tagged fixtures for Artillery scenarios.
 *
 * All fixtures are prefixed with `lt-` so a cleanup script can find them later
 * (DebtLedgerEntry is append-only, so we never DELETE rows from it directly —
 * we just ignore load-test rows via the `lt-` prefix on customer/user names).
 *
 * Creates:
 *   - 1 branch       (name "loadtest-branch")
 *   - 1 MANAGER      (username "lt-manager", password "Pass1234!")
 *   - 1000 DRIVERS   (usernames "lt-driver-0001" … "lt-driver-1000", pwd "Pass1234!")
 *   - 200 customers  (phones 50000001 … 50000200, prefix "lt-")
 *
 * Writes `load-test/fixtures.json` with arrays the scenarios consume.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { PrismaClient, SafariRole } from '@prisma/client';

const DRIVER_COUNT = 1000;
const CUSTOMER_COUNT = 200;
const PASSWORD_PLAIN = 'Pass1234!';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const t0 = Date.now();

  const managerRole = await prisma.role.findUniqueOrThrow({
    where: { name: SafariRole.MANAGER },
  });
  const driverRole = await prisma.role.findUniqueOrThrow({
    where: { name: SafariRole.DRIVER },
  });

  const branch = await prisma.branch.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'loadtest-branch',
      location: 'Kuwait City',
      isActive: true,
    },
    update: { isActive: true },
  });

  const passwordHash = await bcrypt.hash(PASSWORD_PLAIN, 6);

  await prisma.user.upsert({
    where: { username: 'lt-manager' },
    create: {
      username: 'lt-manager',
      password: passwordHash,
      fullName: 'Load-test Manager',
      safariRole: SafariRole.MANAGER,
      roleId: managerRole.id,
      branchId: branch.id,
      isActive: true,
    },
    update: { password: passwordHash, isActive: true, branchId: branch.id },
  });

  console.info(`Seeding ${DRIVER_COUNT} drivers…`);
  const drivers: { username: string; id: string }[] = [];
  const batchSize = 100;
  for (let batchStart = 0; batchStart < DRIVER_COUNT; batchStart += batchSize) {
    await prisma.$transaction(
      Array.from({ length: Math.min(batchSize, DRIVER_COUNT - batchStart) }).map(
        (_, i) => {
          const idx = batchStart + i + 1;
          const username = `lt-driver-${String(idx).padStart(4, '0')}`;
          const prefix = `LT${String(idx).padStart(4, '0')}`;
          return prisma.user.upsert({
            where: { username },
            create: {
              username,
              password: passwordHash,
              fullName: `Load-test Driver ${idx}`,
              safariRole: SafariRole.DRIVER,
              roleId: driverRole.id,
              branchId: branch.id,
              driverPrefix: prefix,
              isActive: true,
            },
            update: { password: passwordHash, isActive: true },
          });
        },
      ),
    );
    if (batchStart % 500 === 0) {
      process.stdout.write(`  ${batchStart + batchSize}/${DRIVER_COUNT}\r`);
    }
  }

  const driverRows = await prisma.user.findMany({
    where: { username: { startsWith: 'lt-driver-' } },
    select: { id: true, username: true },
    orderBy: { username: 'asc' },
  });
  drivers.push(...driverRows);

  console.info(`\nSeeding ${CUSTOMER_COUNT} customers…`);
  const customers: { id: string; phone: string }[] = [];
  // Wipe prior lt-customers so we get a predictable fixture set.
  await prisma.customer.deleteMany({
    where: { displayName: { startsWith: 'lt-customer-' } },
  });
  for (let i = 0; i < CUSTOMER_COUNT; i++) {
    const phone = `5${String(5000000 + i).padStart(7, '0')}`.slice(0, 8);
    const c = await prisma.customer.create({
      data: {
        phone,
        displayName: `lt-customer-${i + 1}`,
        address: 'Kuwait City',
        originBranchId: branch.id,
      },
    });
    customers.push({ id: c.id, phone });
  }

  const fixturesPath = path.resolve(
    __dirname,
    '..',
    'fixtures.json',
  );
  fs.writeFileSync(
    fixturesPath,
    JSON.stringify(
      {
        branchId: branch.id,
        manager: { username: 'lt-manager', password: PASSWORD_PLAIN },
        drivers: drivers.map((d) => ({
          username: d.username,
          password: PASSWORD_PLAIN,
          id: d.id,
        })),
        customers,
      },
      null,
      2,
    ),
  );

  console.info(
    `Seed OK in ${(Date.now() - t0) / 1000}s → ${fixturesPath}\n` +
      `  branch:    ${branch.id}\n` +
      `  manager:   lt-manager / ${PASSWORD_PLAIN}\n` +
      `  drivers:   ${drivers.length}\n` +
      `  customers: ${customers.length}`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
