/**
 * V19.11.1 — Diagnostic: simulates BOTH the new /unpaid-invoices logic
 * (customer-level open with FIFO allocation of customer-wide PAYMENTs)
 * and the /collections red-card formula, side by side.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { DebtSource, PrismaClient, SafariRole } from '@prisma/client';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString?.trim()) throw new Error('DATABASE_URL is not set');
const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  // ---------- /collections formula ----------
  const allTotals = await prisma.debtLedgerEntry.groupBy({
    by: ['customerId', 'source'],
    _sum: { amount: true },
  });
  const byCustomer = new Map<string, { debt: number; payment: number }>();
  for (const g of allTotals) {
    const cur = byCustomer.get(g.customerId) ?? { debt: 0, payment: 0 };
    const v = Number.parseFloat(g._sum.amount?.toString() ?? '0');
    if (g.source === DebtSource.PAYMENT) cur.payment += v;
    else cur.debt += v;
    byCustomer.set(g.customerId, cur);
  }
  let collectionsOpen = 0;
  for (const { debt, payment } of byCustomer.values()) {
    collectionsOpen += Math.max(debt - payment, 0);
  }

  // ---------- /unpaid-invoices NEW formula (per-customer, FIFO) ----------
  const shortfallEntries = await prisma.debtLedgerEntry.findMany({
    where: {
      source: DebtSource.INVOICE_SHORTFALL,
      orderId: { not: null },
      actorUser: {
        is: { safariRole: { in: [SafariRole.DRIVER, SafariRole.MANAGER] } },
      },
    },
    select: {
      orderId: true,
      customerId: true,
      amount: true,
      createdAt: true,
    },
  });
  type Order = { orderId: string; customerId: string; debt: number; createdAt: Date };
  const orders: Order[] = [];
  const byOrder = new Map<string, Order>();
  for (const e of shortfallEntries) {
    if (!e.orderId) continue;
    const existing = byOrder.get(e.orderId);
    if (existing) {
      existing.debt += Number.parseFloat(e.amount.toString());
      continue;
    }
    const o = {
      orderId: e.orderId,
      customerId: e.customerId,
      debt: Number.parseFloat(e.amount.toString()),
      createdAt: e.createdAt,
    };
    byOrder.set(e.orderId, o);
    orders.push(o);
  }
  const paymentsByOrder = orders.length
    ? await prisma.debtLedgerEntry.groupBy({
        by: ['orderId'],
        where: {
          source: DebtSource.PAYMENT,
          orderId: { in: orders.map((o) => o.orderId) },
        },
        _sum: { amount: true },
      })
    : [];
  const paidByOrder = new Map<string, number>();
  for (const g of paymentsByOrder) {
    if (!g.orderId) continue;
    paidByOrder.set(g.orderId, Number.parseFloat(g._sum.amount?.toString() ?? '0'));
  }

  // Group by customer and FIFO-allocate customer-wide open pool
  const byCust = new Map<string, Order[]>();
  for (const o of orders) {
    const arr = byCust.get(o.customerId) ?? [];
    arr.push(o);
    byCust.set(o.customerId, arr);
  }
  let unpaidListOpen = 0;
  for (const [cid, arr] of byCust) {
    arr.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const totals = byCustomer.get(cid) ?? { debt: 0, payment: 0 };
    let pool = Math.max(totals.debt - totals.payment, 0);
    for (const o of arr) {
      const paid = paidByOrder.get(o.orderId) ?? 0;
      const perOrderNet = Math.max(o.debt - paid, 0);
      const share = Math.min(perOrderNet, pool);
      pool -= share;
      unpaidListOpen += share;
    }
  }

  console.log('=== V19.11.1 /collections ↔ /unpaid-invoices comparison ===');
  console.log('');
  console.log(`/collections  totalMarketDebtKd:  ${collectionsOpen.toFixed(3)} KD`);
  console.log(`/unpaid-invoices  openDebtKd:     ${unpaidListOpen.toFixed(3)} KD`);
  console.log(`                       difference: ${(collectionsOpen - unpaidListOpen).toFixed(3)} KD`);
  console.log('');
  if (Math.abs(collectionsOpen - unpaidListOpen) < 0.01) {
    console.log('✓ Numbers match — /unpaid-invoices now mirrors /collections.');
  } else {
    console.log('✗ Still diverges — check scope filters or customers with only non-field-staff invoices.');
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
