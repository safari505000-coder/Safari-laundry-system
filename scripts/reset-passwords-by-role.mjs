import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const NEW_PASSWORD = 'admin';
const BCRYPT_ROUNDS = 10;

const connectionString = process.env.DATABASE_URL;

if (!connectionString?.trim()) {
  console.error('[reset-passwords] DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

async function main() {
  console.log('[reset-passwords] Starting password reset for non-OWNER users.');
  console.log('[reset-passwords] Hashing password once...');

  const hashedPassword = await bcrypt.hash(NEW_PASSWORD, BCRYPT_ROUNDS);
  const passwordUpdatedAt = new Date();

  const users = await prisma.user.findMany({
    where: {
      safariRole: {
        not: 'OWNER',
      },
    },
    select: {
      id: true,
      username: true,
      safariRole: true,
    },
    orderBy: {
      username: 'asc',
    },
  });

  if (users.length === 0) {
    console.log('[reset-passwords] No non-OWNER users found. Nothing to update.');
    console.log(`[reset-passwords] New password: ${NEW_PASSWORD}`);
    return;
  }

  const result = await prisma.user.updateMany({
    where: {
      id: {
        in: users.map((user) => user.id),
      },
      safariRole: {
        not: 'OWNER',
      },
    },
    data: {
      password: hashedPassword,
      mustChangePassword: true,
      passwordUpdatedAt,
    },
  });

  console.log('[reset-passwords] Updated users:');
  for (const user of users) {
    console.log(`- ${user.username} (${user.safariRole})`);
  }

  console.log('[reset-passwords] Complete.');
  console.log(`[reset-passwords] Total updated users: ${result.count}`);
  console.log(`[reset-passwords] New password: ${NEW_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error('[reset-passwords] Failed to reset passwords.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
    await pool.end().catch(() => undefined);
  });
