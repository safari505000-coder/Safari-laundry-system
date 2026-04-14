/**
 * One-off / CI: populate official LaundryPriceListItem rows using DATABASE_URL.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { ensureDefaultPriceList } from '../src/bootstrap/ensure-default-price-list';

const connectionString = process.env.DATABASE_URL;
if (!connectionString?.trim()) {
  throw new Error('DATABASE_URL is not set');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

void (async () => {
  try {
    await ensureDefaultPriceList(prisma);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})();
