import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter: new PrismaPg(pool) });

try {
  const byUsername = await p.user.findUnique({
    where: { username: '514' },
    select: {
      id: true,
      username: true,
      fullName: true,
      employeeId: true,
      isActive: true,
      safariRole: true,
    },
  });
  const byEmployeeId = await p.user.findUnique({
    where: { employeeId: '514' },
    select: {
      id: true,
      username: true,
      fullName: true,
      employeeId: true,
      isActive: true,
      safariRole: true,
    },
  });
  const containing = await p.user.findMany({
    where: {
      OR: [
        { username: { contains: '514' } },
        { employeeId: { contains: '514' } },
      ],
    },
    select: {
      username: true,
      fullName: true,
      employeeId: true,
      isActive: true,
      safariRole: true,
    },
    take: 10,
  });
  console.log('byUsername:', JSON.stringify(byUsername, null, 2));
  console.log('byEmployeeId:', JSON.stringify(byEmployeeId, null, 2));
  console.log('contains-514:', JSON.stringify(containing, null, 2));
} catch (e) {
  console.error('ERR:', e.message);
} finally {
  await p.$disconnect();
  await pool.end();
}
