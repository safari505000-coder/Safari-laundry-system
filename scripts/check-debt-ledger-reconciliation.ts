/**
 * V19.11 — Diagnostic: reconcile DebtLedgerEntry against CustomerWallet.
 *
 * For every customer, computes:
 *   ledgerOpen  = Σ(INVOICE_SHORTFALL + SUBSCRIPTION_OVERUSE) − Σ(PAYMENT)
 *   walletDebt  = wallet.debt − min(0, wallet.balance)   (same formula
 *                  the old `/unpaid-invoices` page used)
 *   delta       = ledgerOpen − walletDebt
 *
 * Rows with |delta| > 0.01 KD are printed. In a perfectly consistent
 * system after backfill + dual-write the table should be empty.
 *
 *   npx tsx scripts/check-debt-ledger-reconciliation.ts
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { DebtSource, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString?.trim()) {
  throw new Error('DATABASE_URL is not set');
}
const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const [ledger, wallets] = await Promise.all([
    prisma.debtLedgerEntry.groupBy({
      by: ['customerId', 'source'],
      _sum: { amount: true },
    }),
    prisma.customerWallet.findMany({
      select: { customerId: true, balance: true, debt: true },
    }),
  ]);

  const perCustomer = new Map<string, { debt: number; payment: number }>();
  for (const g of ledger) {
    const cur = perCustomer.get(g.customerId) ?? { debt: 0, payment: 0 };
    const amt = Number.parseFloat(g._sum.amount?.toString() ?? '0');
    if (g.source === DebtSource.PAYMENT) cur.payment += amt;
    else cur.debt += amt;
    perCustomer.set(g.customerId, cur);
  }

  const walletByCustomer = new Map<string, number>();
  for (const w of wallets) {
    const debt = Number.parseFloat(w.debt?.toString() ?? '0');
    const balance = Number.parseFloat(w.balance?.toString() ?? '0');
    const negBalance = balance < 0 ? -balance : 0;
    walletByCustomer.set(
      w.customerId,
      (debt > 0 ? debt : 0) + negBalance,
    );
  }

  const customerIds = new Set<string>([
    ...perCustomer.keys(),
    ...walletByCustomer.keys(),
  ]);

  let totalLedger = 0;
  let totalWallet = 0;
  const rows: Array<{ customerId: string; ledger: number; wallet: number; delta: number }> = [];
  for (const cid of customerIds) {
    const { debt = 0, payment = 0 } = perCustomer.get(cid) ?? {};
    const ledgerOpen = Math.max(debt - payment, 0);
    const walletOpen = walletByCustomer.get(cid) ?? 0;
    totalLedger += ledgerOpen;
    totalWallet += walletOpen;
    const delta = ledgerOpen - walletOpen;
    if (Math.abs(delta) > 0.01) rows.push({ customerId: cid, ledger: ledgerOpen, wallet: walletOpen, delta });
  }

  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  console.log('=== V19.11 Debt Ledger ↔ Wallet Reconciliation ===');
  console.log(`customers:            ${customerIds.size}`);
  console.log(`total ledger open:    ${totalLedger.toFixed(3)} KD`);
  console.log(`total wallet open:    ${totalWallet.toFixed(3)} KD`);
  console.log(`mismatches (|Δ|>1fils): ${rows.length}`);
  for (const r of rows.slice(0, 20)) {
    console.log(
      `  ${r.customerId.slice(0, 8)}  ledger=${r.ledger.toFixed(3)}  wallet=${r.wallet.toFixed(3)}  Δ=${r.delta.toFixed(3)}`,
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
