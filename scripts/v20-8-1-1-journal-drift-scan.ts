/**
 * V20.8.1.1 — Journal vs DebtLedger drift scanner (READ-ONLY).
 *
 * Scope
 * -----
 * For every customer in the database, compute:
 *   • LedgerNet = Σ(INVOICE_SHORTFALL) + Σ(SUBSCRIPTION_OVERUSE)
 *                 − Σ(real PAYMENT)        // FIFO clamped
 *   • JournalAR = Σ(DR account 1300) − Σ(CR account 1300)
 *   • Delta     = |LedgerNet − JournalAR|
 *
 * This is the EXACT same calculation as
 * `CustomerLedgerService.assertJournalLedgerLockstepTx`, the guard
 * that throws `LEDGER_JOURNAL_DIVERGENCE` and blocks POS checkout
 * when a wallet absorption is requested on a drifted customer.
 *
 * Output
 * ------
 * Writes a markdown report to
 * `docs/v20-8-1-1-journal-drift-scan.md` listing every customer
 * with `delta > 0.001 KD`, sorted by absolute drift, plus
 * direction (overpayment vs underpayment).
 *
 * Hard rule
 * ---------
 * READ-ONLY. No writes anywhere. Safe to run on production. Run:
 *
 *   npx tsx scripts/v20-8-1-1-journal-drift-scan.ts
 *
 * Optional `--customer <uuid>` to scan a single customer (handy
 * when reproducing a known POS_CHECKOUT_ERROR).
 */
import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { DebtSource, PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { Pool } from 'pg';
import { isRealDebtLedgerPayment } from '../src/finance/debt-ledger-payment-origin.util';

const TOLERANCE = new Prisma.Decimal('0.001');

type CustomerRow = { id: string; displayName: string | null; phone: string };

type DriftRow = {
  customerId: string;
  displayName: string | null;
  phone: string;
  ledgerNetKd: string;
  journalArKd: string;
  deltaKd: string;
  direction: 'overpayment_in_journal' | 'underpayment_in_journal';
  ledgerInvoiceKd: string;
  ledgerSubOveruseKd: string;
  ledgerRealPaymentKd: string;
  journalDrCount: number;
  journalCrCount: number;
};

async function computeLedgerNet(
  prisma: PrismaClient,
  customerId: string,
): Promise<{
  net: Prisma.Decimal;
  inv: Prisma.Decimal;
  sub: Prisma.Decimal;
  pay: Prisma.Decimal;
}> {
  const rows = await prisma.debtLedgerEntry.findMany({
    where: { customerId },
    select: {
      source: true,
      amount: true,
      actorUserId: true,
      sourceRef: true,
      note: true,
    },
  });
  let inv = new Prisma.Decimal(0);
  let sub = new Prisma.Decimal(0);
  let pay = new Prisma.Decimal(0);
  for (const r of rows) {
    const amt = new Prisma.Decimal(r.amount?.toString() ?? '0');
    if (r.source === DebtSource.INVOICE_SHORTFALL) inv = inv.add(amt);
    else if (r.source === DebtSource.SUBSCRIPTION_OVERUSE) sub = sub.add(amt);
    else if (r.source === DebtSource.PAYMENT) {
      // Same predicate as the runtime guard; wallet-absorption rows
      // (`PAYMENT:WALLET:` prefix) are excluded by isRealDebtLedgerPayment.
      if (isRealDebtLedgerPayment(r)) pay = pay.add(amt);
    }
  }
  const invPaid = inv.lessThanOrEqualTo(pay) ? inv : pay;
  const payAfterInv = pay.sub(invPaid);
  const subPaid = sub.lessThanOrEqualTo(payAfterInv) ? sub : payAfterInv;
  const net = inv.sub(invPaid).add(sub.sub(subPaid));
  return { net, inv, sub, pay };
}

async function computeJournalAr(
  prisma: PrismaClient,
  customerId: string,
): Promise<{ ar: Prisma.Decimal; drCount: number; crCount: number }> {
  const lines = await prisma.journalLine.findMany({
    where: {
      entry: { customerId },
      account: { code: '1300' },
    },
    select: { debit: true, credit: true },
  });
  let ar = new Prisma.Decimal(0);
  let drCount = 0;
  let crCount = 0;
  for (const line of lines) {
    const dr = new Prisma.Decimal(line.debit.toString());
    const cr = new Prisma.Decimal(line.credit.toString());
    ar = ar.add(dr).sub(cr);
    if (dr.greaterThan(0)) drCount += 1;
    if (cr.greaterThan(0)) crCount += 1;
  }
  return { ar, drCount, crCount };
}

async function scanCustomer(
  prisma: PrismaClient,
  c: CustomerRow,
): Promise<DriftRow | null> {
  const ledger = await computeLedgerNet(prisma, c.id);
  const journal = await computeJournalAr(prisma, c.id);
  const delta = ledger.net.sub(journal.ar).abs();
  if (delta.lessThanOrEqualTo(TOLERANCE)) return null;
  // Direction interpretation:
  //   journalAr < ledgerNet → Journal is missing DRs (under-billed in journal)
  //   journalAr > ledgerNet → Journal is missing CRs (over-billed in journal)
  //   The historical wallet-leak bug produces journalAr < ledgerNet
  //   (wallet CR'd AR but DR side stayed) → "overpayment in journal".
  const direction =
    journal.ar.lessThan(ledger.net)
      ? ('overpayment_in_journal' as const)
      : ('underpayment_in_journal' as const);
  return {
    customerId: c.id,
    displayName: c.displayName,
    phone: c.phone,
    ledgerNetKd: ledger.net.toFixed(4),
    journalArKd: journal.ar.toFixed(4),
    deltaKd: delta.toFixed(4),
    direction,
    ledgerInvoiceKd: ledger.inv.toFixed(4),
    ledgerSubOveruseKd: ledger.sub.toFixed(4),
    ledgerRealPaymentKd: ledger.pay.toFixed(4),
    journalDrCount: journal.drCount,
    journalCrCount: journal.crCount,
  };
}

function parseArgs(argv: string[]): { onlyCustomerId: string | null } {
  let onlyCustomerId: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--customer' && argv[i + 1]) {
      onlyCustomerId = argv[i + 1];
      i += 1;
    }
  }
  return { onlyCustomerId };
}

function makePrisma(): { prisma: PrismaClient; pool: Pool } {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString?.trim()) {
    throw new Error('DATABASE_URL is not set');
  }
  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return { prisma, pool };
}

async function main(): Promise<void> {
  const { onlyCustomerId } = parseArgs(process.argv.slice(2));
  const { prisma, pool } = makePrisma();
  const t0 = Date.now();
  try {
    const customers = await prisma.customer.findMany({
      where: onlyCustomerId ? { id: onlyCustomerId } : undefined,
      select: { id: true, displayName: true, phone: true },
      orderBy: { createdAt: 'asc' },
    });
    console.log(
      `[V20_8_1_1_DRIFT_SCAN] scanning ${customers.length} customer(s)…`,
    );

    const drift: DriftRow[] = [];
    let scanned = 0;
    let nextLog = 100;
    for (const c of customers) {
      const row = await scanCustomer(prisma, c);
      if (row) drift.push(row);
      scanned += 1;
      if (scanned >= nextLog) {
        console.log(
          `[V20_8_1_1_DRIFT_SCAN] progress=${scanned}/${customers.length} drift=${drift.length}`,
        );
        nextLog += 100;
      }
    }

    drift.sort(
      (a, b) =>
        Number.parseFloat(b.deltaKd) - Number.parseFloat(a.deltaKd),
    );

    const elapsedMs = Date.now() - t0;
    const reportPath = path.join(
      process.cwd(),
      'docs',
      'v20-8-1-1-journal-drift-scan.md',
    );

    const totalDrift = drift.reduce(
      (sum, r) => sum.add(new Prisma.Decimal(r.deltaKd)),
      new Prisma.Decimal(0),
    );
    const overpayment = drift.filter(
      (r) => r.direction === 'overpayment_in_journal',
    );
    const underpayment = drift.filter(
      (r) => r.direction === 'underpayment_in_journal',
    );

    const md = renderReport({
      scanned: customers.length,
      drift,
      totalDrift: totalDrift.toFixed(4),
      overpaymentCount: overpayment.length,
      underpaymentCount: underpayment.length,
      elapsedMs,
      onlyCustomerId,
    });

    await fs.writeFile(reportPath, md, 'utf-8');

    console.log(
      `[V20_8_1_1_DRIFT_SCAN] DONE scanned=${customers.length} drift=${drift.length} ` +
        `totalDriftKd=${totalDrift.toFixed(4)} overpayment=${overpayment.length} ` +
        `underpayment=${underpayment.length} elapsedMs=${elapsedMs}`,
    );
    console.log(`[V20_8_1_1_DRIFT_SCAN] report=${reportPath}`);
    if (drift.length === 0) {
      console.log('[V20_8_1_1_DRIFT_SCAN] zero drift — system is clean.');
    } else {
      console.log('[V20_8_1_1_DRIFT_SCAN] top 5:');
      for (const row of drift.slice(0, 5)) {
        console.log(
          `  customer=${row.phone} (${row.customerId}) delta=${row.deltaKd}KD direction=${row.direction}`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

function renderReport(opts: {
  scanned: number;
  drift: DriftRow[];
  totalDrift: string;
  overpaymentCount: number;
  underpaymentCount: number;
  elapsedMs: number;
  onlyCustomerId: string | null;
}): string {
  const lines: string[] = [];
  lines.push('# V20.8.1.1 — Journal ↔ DebtLedger Drift Scan');
  lines.push('');
  lines.push(
    `**Generated:** ${new Date().toISOString()}`,
  );
  lines.push(`**Scope:** ${opts.onlyCustomerId ? `single customer (${opts.onlyCustomerId})` : 'all customers'}`);
  lines.push(`**Scanned:** ${opts.scanned} customer(s) in ${opts.elapsedMs} ms`);
  lines.push('**Tolerance:** 0.001 KD (matches `assertJournalLedgerLockstepTx` runtime guard)');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Customers with drift > tolerance: **${opts.drift.length}**`);
  lines.push(`- Total absolute drift across all customers: **${opts.totalDrift} KD**`);
  lines.push(`- Direction \`overpayment_in_journal\` (journal AR < ledger; AR has phantom credits): **${opts.overpaymentCount}**`);
  lines.push(`- Direction \`underpayment_in_journal\` (journal AR > ledger; AR has phantom debits): **${opts.underpaymentCount}**`);
  lines.push('');
  if (opts.drift.length === 0) {
    lines.push('Zero drift detected — every customer has `Journal AR == Ledger Net` (within tolerance).');
    lines.push('');
    return lines.join('\n');
  }
  lines.push('## Affected customers (sorted by drift, descending)');
  lines.push('');
  lines.push('| # | Customer | Phone | Δ KD | Direction | LedgerNet | JournalAR | DR / CR rows |');
  lines.push('|---|---|---|---:|---|---:|---:|---|');
  opts.drift.forEach((r, idx) => {
    const name = (r.displayName ?? '').replace(/\|/g, '\\|');
    lines.push(
      `| ${idx + 1} | ${name} \`${r.customerId}\` | ${r.phone} | ${r.deltaKd} | ${r.direction} | ${r.ledgerNetKd} | ${r.journalArKd} | ${r.journalDrCount} / ${r.journalCrCount} |`,
    );
  });
  lines.push('');
  lines.push('## Detailed breakdown (LedgerNet inputs)');
  lines.push('');
  lines.push('| Customer | INVOICE_SHORTFALL Σ | SUBSCRIPTION_OVERUSE Σ | real PAYMENT Σ |');
  lines.push('|---|---:|---:|---:|');
  opts.drift.forEach((r) => {
    lines.push(
      `| \`${r.customerId}\` | ${r.ledgerInvoiceKd} | ${r.ledgerSubOveruseKd} | ${r.ledgerRealPaymentKd} |`,
    );
  });
  lines.push('');
  lines.push('## Repair plan (next step — REQUIRES OPERATOR APPROVAL)');
  lines.push('');
  lines.push('For each `overpayment_in_journal` customer:');
  lines.push('');
  lines.push('1. Issue a compensating `JournalEntry`:');
  lines.push('     - DR account 1300 (Accounts Receivable) = delta');
  lines.push('     - CR account 1100 (Cash / Wallet)        = delta');
  lines.push('   …with `entryType = DEBT_ADJUSTMENT`, `sourceRef = "V20_8_1_1:DRIFT_REPAIR:<customerId>"`, and a memo explaining it is a historical wallet-leak repair.');
  lines.push('2. Re-run this scanner; expect `delta = 0.0000` for the repaired customer.');
  lines.push('3. Re-attempt the POS checkout that was previously rejected.');
  lines.push('');
  lines.push('For each `underpayment_in_journal` customer (reversed direction): mirror the entry (DR Cash / CR AR).');
  lines.push('');
  lines.push('No historical journal rows are mutated; the repair is a NEW append-only entry. The runtime guard `assertJournalLedgerLockstepTx` will then accept further wallet absorptions on the customer.');
  lines.push('');
  return lines.join('\n');
}

main().catch((err) => {
  console.error('[V20_8_1_1_DRIFT_SCAN] failed:', err);
  process.exit(1);
});
