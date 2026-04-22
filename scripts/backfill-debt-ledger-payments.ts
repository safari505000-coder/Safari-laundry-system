/**
 * V19.11 — Backfill PAYMENT rows into DebtLedgerEntry from
 * TransactionHistory so the unified ledger covers historical settlements.
 *
 * Sources scanned (one row per TH row, idempotent via `sourceRef`):
 *   • ORDER_WALLET_SETTLEMENT  — metadata.debtSettled > 0 (CC "تم الدفع",
 *     link callback, CC partial, driver POS)
 *   • SUBSCRIPTION_ACTIVATION  — metadata.debtSettled > 0 (auto debt
 *     closure on activation)
 *
 * Idempotency: `sourceRef = 'TH:<transactionHistoryId>'`. Re-running the
 * script skips rows that already have a matching DebtLedgerEntry.
 *
 * Safe to run in production. Writes only; no updates/deletes.
 *
 *   npx tsx scripts/backfill-debt-ledger-payments.ts [--dry-run]
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  DebtEntityCategory,
  DebtSource,
  LedgerTransactionType,
  PrismaClient,
  SafariRole,
} from '@prisma/client';
import { Pool } from 'pg';

const DRY = process.argv.includes('--dry-run');
const connectionString = process.env.DATABASE_URL;
if (!connectionString?.trim()) {
  throw new Error('DATABASE_URL is not set');
}

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type MetaLike = Record<string, unknown> | null | undefined;

function extractDebtSettledKd(meta: MetaLike): string | null {
  if (!meta) return null;
  const v = (meta as Record<string, unknown>).debtSettled;
  if (typeof v === 'string') {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) && n > 0 ? v : null;
  }
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
    return String(v);
  }
  return null;
}

function resolveCategory(role: SafariRole | null | undefined): DebtEntityCategory {
  if (role === SafariRole.OWNER) return DebtEntityCategory.OWNER;
  if (role === SafariRole.DRIVER) return DebtEntityCategory.DRIVER;
  if (
    role === SafariRole.CALL_CENTER ||
    role === SafariRole.CALL_CENTER_SUPERVISOR
  )
    return DebtEntityCategory.CALL_CENTER;
  return DebtEntityCategory.BRANCH;
}

async function main() {
  console.log(
    `--- V19.11 DebtLedgerEntry PAYMENT backfill${DRY ? ' [DRY-RUN]' : ''} ---`,
  );

  const rows = await prisma.transactionHistory.findMany({
    where: {
      type: {
        in: [
          LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
          LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
        ],
      },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      type: true,
      customerId: true,
      orderId: true,
      performedById: true,
      metadata: true,
      createdAt: true,
    },
  });

  console.log(`scanned ${rows.length} TransactionHistory rows`);

  const actorIds = Array.from(
    new Set(rows.map((r) => r.performedById).filter((x): x is string => !!x)),
  );
  const actors = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, safariRole: true, branchId: true },
  });
  const actorMap = new Map(actors.map((a) => [a.id, a]));

  const existing = await prisma.debtLedgerEntry.findMany({
    where: {
      source: DebtSource.PAYMENT,
      sourceRef: { not: null },
    },
    select: { sourceRef: true },
  });
  const existingRefs = new Set(existing.map((e) => e.sourceRef));
  console.log(`found ${existingRefs.size} PAYMENT rows already backfilled`);

  let created = 0;
  let skippedExisting = 0;
  let skippedZero = 0;
  let skippedNoOrder = 0;
  let totalSettledKd = 0;

  for (const r of rows) {
    const sourceRef = `TH:${r.id}`;
    if (existingRefs.has(sourceRef)) {
      skippedExisting += 1;
      continue;
    }
    const settledStr = extractDebtSettledKd(r.metadata as MetaLike);
    if (!settledStr) {
      skippedZero += 1;
      continue;
    }
    const amount = Number.parseFloat(settledStr);
    totalSettledKd += amount;

    const actor = r.performedById ? actorMap.get(r.performedById) : null;
    const category = resolveCategory(actor?.safariRole);
    const branchId = actor?.branchId ?? null;

    if (DRY) {
      created += 1;
      continue;
    }

    try {
      await prisma.debtLedgerEntry.create({
        data: {
          customerId: r.customerId,
          orderId: r.orderId ?? null,
          source: DebtSource.PAYMENT,
          category,
          amount: settledStr,
          branchId,
          actorUserId: r.performedById ?? null,
          note:
            r.type === LedgerTransactionType.SUBSCRIPTION_ACTIVATION
              ? 'Backfill — subscription activation settled debt'
              : 'Backfill — order-wallet settlement (debt payment)',
          sourceRef,
          createdAt: r.createdAt,
        },
      });
      created += 1;
    } catch (e) {
      if (String(e).includes('sourceRef')) {
        skippedExisting += 1;
      } else if (String(e).includes('Foreign key')) {
        skippedNoOrder += 1;
      } else {
        console.warn(`row ${r.id} failed:`, String(e).slice(0, 200));
      }
    }
  }

  console.log('--- summary ---');
  console.log(`created (PAYMENT rows):       ${created}`);
  console.log(`already-backfilled:           ${skippedExisting}`);
  console.log(`zero/no-debtSettled:          ${skippedZero}`);
  console.log(`FK violations (order gone):   ${skippedNoOrder}`);
  console.log(`total debtSettled observed:   ${totalSettledKd.toFixed(3)} KD`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await prisma.$disconnect();
  } catch {}
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
