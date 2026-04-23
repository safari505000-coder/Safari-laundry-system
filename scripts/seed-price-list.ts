/**
 * One-off / CI: apply full PDF tariff (`src/bootstrap/laundry-price-list.seed.ts`) via DATABASE_URL.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { seedLaundryPriceList } from '../src/bootstrap/laundry-price-list.seed';

const connectionString = process.env.DATABASE_URL;
if (!connectionString?.trim()) {
  throw new Error('DATABASE_URL is not set');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

void (async () => {
  try {
    await seedLaundryPriceList(prisma);
    console.info('Laundry price list seed complete.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})();
