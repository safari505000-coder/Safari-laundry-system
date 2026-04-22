/**
 * V19.11.3 — Retroactively normalize historical electronic orders.
 *
 * Before this change, every completed POS order (CASH, KNET, ONLINE,
 * PAYMENT_LINK) was stamped `cashStatus = PAID_TO_DRIVER`, which caused
 * KNET/ONLINE amounts to appear in "driver cash" trails. Now that
 * `CashStatus.PAID_ONLINE` exists, we flip any order whose
 * `posPaymentMethod` is electronic and whose `cashStatus` is still
 * PAID_TO_DRIVER (i.e. it was never handed over — which is the correct
 * terminal state for electronic money: it stays `PAID_ONLINE` forever).
 *
 * Safe to re-run: no-op for orders already in `PAID_ONLINE`,
 * `HANDED_OVER_TO_OFFICE`, or `UNPAID`.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { CashStatus, PosPaymentMethod, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString?.trim()) throw new Error('DATABASE_URL is not set');
const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const ELECTRONIC = [
  PosPaymentMethod.KNET,
  PosPaymentMethod.PAYMENT_LINK,
  PosPaymentMethod.ONLINE,
] as const;

async function main() {
  const before = await prisma.order.groupBy({
    by: ['posPaymentMethod', 'cashStatus'],
    where: { posPaymentMethod: { in: [...ELECTRONIC] } },
    _count: { _all: true },
  });
  console.log('Before (electronic orders only):');
  for (const row of before) {
    console.log(
      `  ${row.posPaymentMethod}  / ${row.cashStatus}  → ${row._count._all}`,
    );
  }

  const { count } = await prisma.order.updateMany({
    where: {
      posPaymentMethod: { in: [...ELECTRONIC] },
      cashStatus: CashStatus.PAID_TO_DRIVER,
    },
    data: { cashStatus: CashStatus.PAID_ONLINE },
  });
  console.log(`\nBackfill updated ${count} order(s) → PAID_ONLINE.`);

  const after = await prisma.order.groupBy({
    by: ['posPaymentMethod', 'cashStatus'],
    where: { posPaymentMethod: { in: [...ELECTRONIC] } },
    _count: { _all: true },
  });
  console.log('\nAfter:');
  for (const row of after) {
    console.log(
      `  ${row.posPaymentMethod}  / ${row.cashStatus}  → ${row._count._all}`,
    );
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try { await prisma.$disconnect(); } catch {}
  try { await pool.end(); } catch {}
  process.exit(1);
});
