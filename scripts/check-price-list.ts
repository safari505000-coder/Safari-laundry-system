/**
 * One-off diagnostic: dump current LaundryPriceListItem state grouped by
 * category so we can see what the DB actually has vs what the seed files
 * claim. Prints counts and item codes per category.
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
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

void (async () => {
  try {
    const categories = await prisma.laundryItemCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          select: { code: true, nameAr: true, sortOrder: true },
        },
      },
    });
    const orphans = await prisma.laundryPriceListItem.findMany({
      where: { categoryId: null },
      orderBy: { sortOrder: 'asc' },
      select: { code: true, nameAr: true, sortOrder: true },
    });
    const total = await prisma.laundryPriceListItem.count();

    console.log(`\n=== TOTAL ITEMS: ${total} ===\n`);
    for (const c of categories) {
      console.log(
        `[${c.sortOrder}] ${c.code} — ${c.nameAr} (${c.items.length} items)`,
      );
      for (const it of c.items) {
        console.log(`    ${it.sortOrder}: ${it.code} — ${it.nameAr}`);
      }
    }
    if (orphans.length) {
      console.log(`\n[ORPHANS: no category] (${orphans.length} items)`);
      for (const it of orphans) {
        console.log(`    ${it.sortOrder}: ${it.code} — ${it.nameAr}`);
      }
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})();
