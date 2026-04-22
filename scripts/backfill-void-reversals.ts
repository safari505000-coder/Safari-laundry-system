/**
 * V19.11 — Backfill PAYMENT rows to offset invoices that were voided /
 * edited BEFORE the unified-ledger cutover wired such mutations into
 * the ledger. Walks InvoiceAuditLog for VOID/EDIT actions and emits a
 * PAYMENT entry equal to the voided invoice's total (DEBT_ON_ACCOUNT
 * only — other methods never created a DebtLedgerEntry to cancel).
 *
 * Idempotent via `sourceRef = 'AUDIT:<id>'`.
 *
 *   npx tsx scripts/backfill-void-reversals.ts [--dry-run]
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  DebtEntityCategory,
  DebtSource,
  InvoiceAuditAction,
  PosPaymentMethod,
  PrismaClient,
} from '@prisma/client';
import { Pool } from 'pg';

const DRY = process.argv.includes('--dry-run');
const connectionString = process.env.DATABASE_URL;
if (!connectionString?.trim()) {
  throw new Error('DATABASE_URL is not set');
}

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log(
    `--- V19.11 void/edit reversal backfill${DRY ? ' [DRY-RUN]' : ''} ---`,
  );

  const audits = await prisma.invoiceAuditLog.findMany({
    where: {
      action: { in: [InvoiceAuditAction.VOID, InvoiceAuditAction.EDIT] },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      action: true,
      orderId: true,
      actorId: true,
      beforeSnapshot: true,
      createdAt: true,
    },
  });

  const existing = await prisma.debtLedgerEntry.findMany({
    where: {
      source: DebtSource.PAYMENT,
      sourceRef: { startsWith: 'AUDIT:' },
    },
    select: { sourceRef: true },
  });
  const existingRefs = new Set(existing.map((e) => e.sourceRef));
  console.log(`${audits.length} audit rows scanned, ${existingRefs.size} already backfilled`);

  let created = 0;
  let skippedNonDebt = 0;
  for (const a of audits) {
    const ref = `AUDIT:${a.id}`;
    if (existingRefs.has(ref)) continue;

    const snap = (a.beforeSnapshot as Record<string, unknown>) ?? {};
    const method = snap.posPaymentMethod as string | undefined;
    const totalStr = snap.totalPrice as string | undefined;
    const customerId = snap.customerId as string | undefined;
    if (
      method !== PosPaymentMethod.DEBT_ON_ACCOUNT ||
      !totalStr ||
      !customerId ||
      !a.orderId
    ) {
      skippedNonDebt += 1;
      continue;
    }
    const amount = Number.parseFloat(totalStr);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    if (DRY) {
      created += 1;
      continue;
    }
    try {
      await prisma.debtLedgerEntry.create({
        data: {
          customerId,
          orderId: a.orderId,
          source: DebtSource.PAYMENT,
          category: DebtEntityCategory.BRANCH,
          amount: totalStr,
          actorUserId: a.actorId,
          note:
            a.action === InvoiceAuditAction.VOID
              ? 'Backfill — debt cleared by invoice void'
              : 'Backfill — debt reversed during invoice edit',
          sourceRef: ref,
          createdAt: a.createdAt,
        },
      });
      created += 1;
    } catch (e) {
      console.warn(`audit ${a.id} failed:`, String(e).slice(0, 200));
    }
  }

  console.log(`created: ${created}, skipped (non-DEBT_ON_ACCOUNT): ${skippedNonDebt}`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try { await prisma.$disconnect(); } catch {}
  try { await pool.end(); } catch {}
  process.exit(1);
});
