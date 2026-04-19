/**
 * V19.3 — Ensure the `GENERAL_MANAGER` row exists in the `Role` table.
 *
 * The Postgres enum value is already guaranteed by migration
 * `20260419160000_safari_role_general_manager`; this script mirrors the
 * idempotent upsert that `src/main.ts` performs at bootstrap so staging
 * becomes consistent without waiting for a server restart.
 *
 * Usage: npx tsx scripts/ensure-general-manager-role.ts
 * (DATABASE_URL is read from .env via dotenv/config.)
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString?.trim()) {
  throw new Error('DATABASE_URL is not set');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const before = await prisma.role.findUnique({ where: { name: 'GENERAL_MANAGER' } });
  const row = await prisma.role.upsert({
    where: { name: 'GENERAL_MANAGER' },
    update: {},
    create: { name: 'GENERAL_MANAGER' },
  });
  console.log(
    JSON.stringify(
      {
        action: before ? 'already_present' : 'created',
        id: row.id,
        name: row.name,
        createdAt: row.createdAt,
      },
      null,
      2,
    ),
  );

  const all = await prisma.role.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  console.log('\nAll Role rows:');
  for (const r of all) console.log(`  - ${r.name}  (${r.id})`);
}

void (async () => {
  try {
    await main();
  } catch (err) {
    console.error('[ensure-general-manager-role] FAILED:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})();
