/**
 * Throwaway verifier for the V5.2 master price list seed. Prints the total
 * item count, per-category row counts, and the full row grid so the operator
 * can eyeball the numbers against the PDF before shipping.
 *
 * Invoke with: `npx tsx prisma/verify-seed.ts`
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const totalItems = await prisma.laundryPriceListItem.count();
  const activeItems = await prisma.laundryPriceListItem.count({
    where: { isActive: true },
  });
  const cats = await prisma.laundryItemCategory.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { items: true } } },
  });

  console.log(`\n--- MASTER PRICE LIST (V5.2) ---`);
  console.log(`Total items: ${totalItems} (active: ${activeItems})`);
  console.log(`Categories : ${cats.length}`);
  for (const c of cats) {
    console.log(
      `  • [${c.code.padEnd(14)}] ${c.nameEn?.padEnd(18)} — ${c._count.items} items`,
    );
  }

  const rows = await prisma.laundryPriceListItem.findMany({
    include: { category: true },
    orderBy: { sortOrder: 'asc' },
  });
  console.log(`\n--- ROW GRID (code | nameEn | N | U | P | UP | manual) ---`);
  for (const r of rows) {
    const n = r.priceNormal.toFixed(3);
    const u = r.priceUrgent.toFixed(3);
    const p = r.pricePressOnly ? r.pricePressOnly.toFixed(3) : '  —  ';
    const up = r.priceUrgentPress ? r.priceUrgentPress.toFixed(3) : '  —  ';
    console.log(
      `  ${r.code.padEnd(20)} ${(r.nameEn ?? '').padEnd(22)} ${n} / ${u} / ${p} / ${up}${r.manualEntry ? ' (manual)' : ''}`,
    );
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
