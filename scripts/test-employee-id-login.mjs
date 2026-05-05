import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const TARGET_USERNAME = '514';
const TEST_EMPLOYEE_ID = 'EMP-514';
const PASSWORD = 'manager123';

try {
  await prisma.user.update({
    where: { username: TARGET_USERNAME },
    data: { employeeId: TEST_EMPLOYEE_ID },
  });
  console.log(`Set employeeId="${TEST_EMPLOYEE_ID}" on user "${TARGET_USERNAME}".`);

  const res = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: TEST_EMPLOYEE_ID, password: PASSWORD }),
  });
  const status = res.status;
  const body = await res.json().catch(() => null);
  console.log('login status:', status);
  if (body?.data?.user) {
    console.log('Logged in as:', {
      username: body.data.user.username,
      fullName: body.data.user.fullName,
      safariRole: body.data.user.safariRole,
    });
  } else {
    console.log('body:', JSON.stringify(body, null, 2));
  }

  const wrong = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: TEST_EMPLOYEE_ID, password: 'wrong-on-purpose' }),
  });
  console.log('wrong-pwd via employeeId status:', wrong.status, '(expect 401)');
} catch (e) {
  console.error('ERR:', e.message);
} finally {
  await prisma.user.update({
    where: { username: TARGET_USERNAME },
    data: { employeeId: null },
  });
  console.log('Cleanup: cleared test employeeId.');
  await prisma.$disconnect();
  await pool.end();
}
