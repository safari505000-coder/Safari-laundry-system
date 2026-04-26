/**
 * One-off: set password = "admin" for all staff created by
 * `seed-staff-from-roster.ts` (usernames starting with `emp-`).
 *
 *   npx tsx scripts/unify-seeded-passwords.ts
 *   npx tsx scripts/unify-seeded-passwords.ts --dry-run
 *
 * Does NOT touch pre-existing accounts (admin, 511..521), so the
 * owner's / GM's passwords stay untouched.
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

const cs = process.env.DATABASE_URL;
if (!cs?.trim()) throw new Error('DATABASE_URL is not set');
const pool = new Pool({ connectionString: cs });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const DRY = process.argv.includes('--dry-run');

async function main() {
  const rows = await prisma.user.findMany({
    where: { username: { startsWith: 'emp-' } },
    select: { id: true, username: true, fullName: true },
  });
  if (rows.length === 0) {
    console.log('No emp-* users found.');
    return;
  }
  console.log(
    `Found ${rows.length} seeded users. ${DRY ? 'Dry-run — not touching DB.' : 'Hashing and updating…'}`,
  );
  if (DRY) {
    for (const r of rows.slice(0, 10)) {
      console.log(`  ${r.username.padEnd(14)} ${r.fullName}`);
    }
    if (rows.length > 10) console.log(`  …and ${rows.length - 10} more`);
    return;
  }
  const hash = await bcrypt.hash('admin', 10);
  const result = await prisma.user.updateMany({
    where: { username: { startsWith: 'emp-' } },
    data: { password: hash },
  });
  console.log(`Updated ${result.count} user password(s) to "admin".`);
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
