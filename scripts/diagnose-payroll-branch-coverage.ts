/**
 * Read-only: active users grouped by branch (matches مسير الرواتب counts).
 *
 *   npx tsx scripts/diagnose-payroll-branch-coverage.ts
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
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const [grouped, branches, roleAgg] = await Promise.all([
    prisma.user.groupBy({
      by: ['branchId'],
      where: { isActive: true },
      _count: { _all: true },
    }),
    prisma.branch.findMany({
      select: { id: true, name: true, isActive: true },
      orderBy: { name: 'asc' },
    }),
    prisma.user.groupBy({
      by: ['safariRole'],
      where: { isActive: true },
      _count: { _all: true },
    }),
  ]);

  const nameById = new Map(branches.map((b) => [b.id, b.name]));

  console.log('=== Active users by branch (User.branchId) ===\n');
  const lines = grouped
    .map((g) => ({
      label: g.branchId
        ? (nameById.get(g.branchId) ?? `UNKNOWN_ID ${g.branchId}`)
        : '(null — بدون فرع)',
      count: g._count._all,
      branchId: g.branchId,
    }))
    .sort((a, b) => b.count - a.count);

  let total = 0;
  for (const row of lines) {
    total += row.count;
    console.log(
      `${String(row.count).padStart(4)}  ${row.label}${row.branchId ? '' : ''}`,
    );
  }
  console.log(`\nTotal active users: ${total}`);
  console.log('\n=== Active users by safariRole ===\n');
  for (const r of roleAgg.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`${String(r._count._all).padStart(4)}  ${r.safariRole}`);
  }

  console.log('\n=== Branches in registry ===\n');
  for (const b of branches) {
    console.log(
      `${b.isActive ? ' ' : '×'} ${b.name.padEnd(40)} ${b.id.slice(0, 8)}…`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
