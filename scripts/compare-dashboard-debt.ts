/**
 * V19.11.4 — Diagnostic: compares the old /debt-by-category aggregation
 * (gross debt issued, grouped by category) against the unified
 * /unpaid-invoices open debt (per-customer FIFO, payments netted out).
 * Explains the "BRANCH + DRIVER dashboard ≠ unpaid-invoices total" gap.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  DebtEntityCategory,
  DebtSource,
  PrismaClient,
  SafariRole,
} from '@prisma/client';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString?.trim()) throw new Error('DATABASE_URL is not set');
const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  // ---------- OLD dashboard formula (gross, grouped by category) ----------
  const grossByCategory = await prisma.debtLedgerEntry.groupBy({
    by: ['category'],
    where: {
      source: { in: [DebtSource.INVOICE_SHORTFALL, DebtSource.SUBSCRIPTION_OVERUSE] },
    },
    _sum: { amount: true },
  });
  const grossAgg: Record<string, number> = {};
  for (const g of grossByCategory) {
    grossAgg[g.category] = Number.parseFloat(g._sum.amount?.toString() ?? '0');
  }
  const dashboardBranchPlusDriver =
    (grossAgg[DebtEntityCategory.BRANCH] ?? 0) +
    (grossAgg[DebtEntityCategory.DRIVER] ?? 0);

  // ---------- NEW formula: NET open debt per issuer (FIFO) ----------
  const shortfallEntries = await prisma.debtLedgerEntry.findMany({
    where: {
      source: DebtSource.INVOICE_SHORTFALL,
      orderId: { not: null },
    },
    select: {
      orderId: true,
      customerId: true,
      amount: true,
      createdAt: true,
      actorUser: { select: { safariRole: true } },
    },
  });
  type O = {
    orderId: string;
    customerId: string;
    debt: number;
    createdAt: Date;
    issuerRole: SafariRole | null;
  };
  const byOrder = new Map<string, O>();
  for (const e of shortfallEntries) {
    if (!e.orderId) continue;
    const ex = byOrder.get(e.orderId);
    const amt = Number.parseFloat(e.amount.toString());
    if (ex) {
      ex.debt += amt;
      continue;
    }
    byOrder.set(e.orderId, {
      orderId: e.orderId,
      customerId: e.customerId,
      debt: amt,
      createdAt: e.createdAt,
      issuerRole: e.actorUser?.safariRole ?? null,
    });
  }
  const orders = Array.from(byOrder.values());
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
  for (const g of paymentsByOrder)
    if (g.orderId)
      paidByOrder.set(
        g.orderId,
        Number.parseFloat(g._sum.amount?.toString() ?? '0'),
      );

  const customerIds = Array.from(new Set(orders.map((o) => o.customerId)));
  const custTotals = customerIds.length
    ? await prisma.debtLedgerEntry.groupBy({
        by: ['customerId', 'source'],
        where: { customerId: { in: customerIds } },
        _sum: { amount: true },
      })
    : [];
  const perCustomer = new Map<string, { debt: number; payment: number }>();
  for (const g of custTotals) {
    const cur = perCustomer.get(g.customerId) ?? { debt: 0, payment: 0 };
    const v = Number.parseFloat(g._sum.amount?.toString() ?? '0');
    if (g.source === DebtSource.PAYMENT) cur.payment += v;
    else cur.debt += v;
    perCustomer.set(g.customerId, cur);
  }

  const byCust = new Map<string, O[]>();
  for (const o of orders) {
    const arr = byCust.get(o.customerId) ?? [];
    arr.push(o);
    byCust.set(o.customerId, arr);
  }

  let netDriver = 0;
  let netBranch = 0;
  let netOther = 0;
  for (const [cid, arr] of byCust) {
    arr.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const tot = perCustomer.get(cid) ?? { debt: 0, payment: 0 };
    let pool = Math.max(tot.debt - tot.payment, 0);
    for (const o of arr) {
      const paid = paidByOrder.get(o.orderId) ?? 0;
      const perOrderNet = Math.max(o.debt - paid, 0);
      const share = Math.min(perOrderNet, pool);
      pool -= share;
      if (o.issuerRole === SafariRole.DRIVER) netDriver += share;
      else if (
        o.issuerRole === SafariRole.MANAGER ||
        o.issuerRole === SafariRole.SUPERVISOR
      )
        netBranch += share;
      else netOther += share;
    }
  }

  console.log('=== V19.11.4 Dashboard debt-distribution audit ===\n');
  console.log('OLD (gross debt issued, per category):');
  console.log(
    `  BRANCH : ${(grossAgg[DebtEntityCategory.BRANCH] ?? 0).toFixed(3)} KD`,
  );
  console.log(
    `  DRIVER : ${(grossAgg[DebtEntityCategory.DRIVER] ?? 0).toFixed(3)} KD`,
  );
  console.log(
    `  sum    : ${dashboardBranchPlusDriver.toFixed(3)} KD  ← dashboard pie today\n`,
  );
  console.log('NEW (open debt, per invoice issuer, payments netted):');
  console.log(`  BRANCH : ${netBranch.toFixed(3)} KD`);
  console.log(`  DRIVER : ${netDriver.toFixed(3)} KD`);
  console.log(`  OTHER  : ${netOther.toFixed(3)} KD  (non-field-staff issuers)`);
  console.log(
    `  sum    : ${(netBranch + netDriver + netOther).toFixed(3)} KD  ← matches /unpaid-invoices openDebtKd\n`,
  );
  console.log(
    `Gap explained = ${(dashboardBranchPlusDriver - (netBranch + netDriver)).toFixed(3)} KD (payments never subtracted in the dashboard).`,
  );

  await prisma.$disconnect();
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
