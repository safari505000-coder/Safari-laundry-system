import 'dotenv/config';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg(
  new pg.Pool({ connectionString: process.env.DATABASE_URL }),
);
const prisma = new PrismaClient({ adapter });

const actions = [
  'DISPATCH_CREATED',
  'DISPATCH_REASSIGNED',
  'DISPATCH_ESCALATED',
  'DISPATCH_RECONCILED',
  'DISPATCH_COMPLETED',
];
const counts = {};
for (const a of actions) {
  counts[a] = await prisma.auditLog.count({ where: { action: a } });
}
console.log(JSON.stringify(counts, null, 2));
await prisma.$disconnect();
