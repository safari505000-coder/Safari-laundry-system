import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import pg from 'pg';

const username = process.argv[2];
const newPassword = process.argv[3];

if (!username || !newPassword) {
  console.error('Usage: node scripts/reset-user-password.mjs <username> <newPassword>');
  process.exit(1);
}

const ROUNDS = Number.parseInt(process.env.BCRYPT_ROUNDS ?? '10', 10);

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

try {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, fullName: true, isActive: true, safariRole: true },
  });
  if (!user) {
    console.error(`No user with username "${username}".`);
    process.exit(2);
  }
  const hash = await bcrypt.hash(newPassword, ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hash },
  });
  console.log(`OK: reset password for ${user.username} (${user.fullName} · ${user.safariRole}).`);
  console.log(`     id=${user.id} · isActive=${user.isActive} · bcrypt rounds=${ROUNDS}`);
  console.log(`     New password: ${newPassword}`);
} catch (e) {
  console.error('ERR:', e.message);
  process.exit(3);
} finally {
  await prisma.$disconnect();
  await pool.end();
}
