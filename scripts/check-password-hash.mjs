import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

try {
  const u = await prisma.user.findUnique({
    where: { username: '514' },
    select: { id: true, password: true, isActive: true, safariRole: true },
  });
  if (!u) {
    console.log('NO USER 514');
    process.exit(0);
  }
  console.log('hash prefix:', u.password.slice(0, 7));
  console.log('isActive   :', u.isActive);
  console.log('safariRole :', u.safariRole);
  for (const candidate of ['manager123', 'admin', 'x', '514']) {
    const ok = await bcrypt.compare(candidate, u.password);
    console.log(`bcrypt.compare("${candidate}") =`, ok);
  }
} finally {
  await prisma.$disconnect();
  await pool.end();
}
