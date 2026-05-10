/**
 * V20.1-v3 — Backfill PAYMENT:WALLET: rows for historical wallet absorption.
 *
 * Background
 * ----------
 * Pre-V20.1, `applyOrderWalletSettlementForCompletedOrder` deducted
 * `min(CustomerWallet.balance, Order.totalPrice)` for ANY posPaymentMethod,
 * **without** writing a corresponding DebtLedgerEntry. The wallet drain was
 * recorded only on `TransactionHistory.metadata.appliedFromWallet`.
 *
 * This script reconstructs an audit-only wallet PAYMENT row per affected
 * order. v3 aligns the backfill sourceRef shape with the live path:
 *
 *   sourceRef = `PAYMENT:WALLET:<orderId>:APPLIED`
 *
 * One row per orderId — even if multiple TransactionHistory rows exist for
 * that order (e.g. §C-8 walletSettledAt-reset re-entry), the amount is the
 * SUM of `metadata.appliedFromWallet` across them. The `@@unique([sourceRef])`
 * on DebtLedgerEntry guarantees one row per order; P2002 on collision is
 * silently absorbed (the live row already covers the order).
 *
 * The rows produced are excluded from `isRealDebtLedgerPayment()` and
 * therefore do NOT change any AR / debt aggregate. They are pure audit
 * evidence — surfaced via `isWalletAbsorptionLedgerEntry()` in reports
 * and the new `/finance/audit/*` endpoints.
 *
 * v3 log lines (matches the v3 prompt monitoring spec):
 *   [BACKFILL_CREATED]            — one row inserted
 *   [BACKFILL_DUPLICATE_SKIPPED]  — sourceRef already exists (live or prior backfill)
 *   [BACKFILL_MISMATCH]           — final tally Σ(appliedFromWallet) ≠ Σ(wallet PAYMENT)
 *
 * Modes
 * -----
 *   npx tsx scripts/backfill-wallet-payments.ts            # dry-run (default)
 *   npx tsx scripts/backfill-wallet-payments.ts --apply    # actually write
 *   npx tsx scripts/backfill-wallet-payments.ts --customer <uuid>   # one customer
 *
 * Always safe to re-run: existing sourceRef collisions are skipped.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  DebtEntityCategory,
  DebtSource,
  LedgerTransactionType,
  Prisma,
  PrismaClient,
  SafariRole,
} from '@prisma/client';
import { Pool } from 'pg';

const APPLY = process.argv.includes('--apply');
const customerArgIndex = process.argv.indexOf('--customer');
const FILTER_CUSTOMER_ID =
  customerArgIndex >= 0 && process.argv[customerArgIndex + 1]
    ? process.argv[customerArgIndex + 1]
    : null;

const connectionString = process.env.DATABASE_URL;
if (!connectionString?.trim()) {
  throw new Error('DATABASE_URL is not set');
}

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type MetaLike = Record<string, unknown> | null | undefined;

function extractAppliedFromWalletKd(meta: MetaLike): string | null {
  if (!meta) return null;
  const v = (meta as Record<string, unknown>).appliedFromWallet;
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
  ) {
    return DebtEntityCategory.CALL_CENTER;
  }
  return DebtEntityCategory.BRANCH;
}

async function resolveFallbackOwnerId(): Promise<string | null> {
  const owner = await prisma.user.findFirst({
    where: { safariRole: SafariRole.OWNER },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  return owner?.id ?? null;
}

type AggregatedOrder = {
  orderId: string;
  customerId: string;
  totalAppliedKd: Prisma.Decimal;
  earliestCreatedAt: Date;
  representativePerformerId: string | null;
};

async function main(): Promise<void> {
  console.log(
    `V20.1-v3 wallet-payment backfill — mode=${APPLY ? 'APPLY' : 'dry-run'} customer=${FILTER_CUSTOMER_ID ?? 'ALL'}`,
  );

  const fallbackOwnerId = await resolveFallbackOwnerId();
  if (!fallbackOwnerId) {
    throw new Error(
      'No OWNER user exists in the system; cannot attribute backfilled rows.',
    );
  }

  // Step 1 — pull all wallet-applied TransactionHistory rows.
  const candidates = await prisma.transactionHistory.findMany({
    where: {
      type: LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
      orderId: { not: null },
      ...(FILTER_CUSTOMER_ID ? { customerId: FILTER_CUSTOMER_ID } : {}),
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      customerId: true,
      orderId: true,
      metadata: true,
      performedById: true,
      createdAt: true,
    },
  });

  // Step 2 — aggregate per order. The deterministic v3 sourceRef is
  // one row per order; if a customer has multiple TH rows for the
  // same order (e.g. §C-8 re-entry), sum their appliedFromWallet so
  // the single audit row reflects total absorption.
  const perOrder = new Map<string, AggregatedOrder>();
  let scanned = 0;
  let skippedNoWalletApplied = 0;
  let totalAppliedFromTh = new Prisma.Decimal(0);
  for (const th of candidates) {
    scanned += 1;
    if (!th.orderId) continue;
    const appliedKd = extractAppliedFromWalletKd(th.metadata as MetaLike);
    if (!appliedKd) {
      skippedNoWalletApplied += 1;
      continue;
    }
    const amount = new Prisma.Decimal(appliedKd);
    totalAppliedFromTh = totalAppliedFromTh.add(amount);
    const existing = perOrder.get(th.orderId);
    if (existing) {
      existing.totalAppliedKd = existing.totalAppliedKd.add(amount);
      if (th.createdAt < existing.earliestCreatedAt) {
        existing.earliestCreatedAt = th.createdAt;
      }
    } else {
      perOrder.set(th.orderId, {
        orderId: th.orderId,
        customerId: th.customerId,
        totalAppliedKd: amount,
        earliestCreatedAt: th.createdAt,
        representativePerformerId: th.performedById ?? null,
      });
    }
  }

  let written = 0;
  let skippedExisting = 0;
  let errored = 0;

  for (const order of perOrder.values()) {
    const sourceRef = `PAYMENT:WALLET:${order.orderId}:APPLIED`;

    // Idempotency check before insert (also gives us a clean log line).
    const existing = await prisma.debtLedgerEntry.findUnique({
      where: { sourceRef },
      select: { id: true },
    });
    if (existing) {
      skippedExisting += 1;
      console.log(
        '[BACKFILL_DUPLICATE_SKIPPED]',
        JSON.stringify({
          orderId: order.orderId,
          customerId: order.customerId,
          sourceRef,
          totalAppliedKd: order.totalAppliedKd.toFixed(4),
        }),
      );
      continue;
    }

    const performer =
      order.representativePerformerId
        ? await prisma.user.findUnique({
            where: { id: order.representativePerformerId },
            select: { id: true, branchId: true, safariRole: true },
          })
        : null;
    const actorId = performer?.id ?? fallbackOwnerId;
    const actorRole = performer?.safariRole ?? SafariRole.OWNER;
    const branchId = performer?.branchId ?? null;
    const category = resolveCategory(actorRole);

    // Tag the row metadata as SYSTEM_BACKFILL so future audit queries
    // can distinguish backfill rows from natively-written rows even
    // though both share the deterministic sourceRef shape.
    const note =
      'V20.1-v3 SYSTEM_BACKFILL: wallet credit applied to invoice (audit only)';

    if (APPLY) {
      try {
        await prisma.debtLedgerEntry.create({
          data: {
            customerId: order.customerId,
            orderId: order.orderId,
            source: DebtSource.PAYMENT,
            category,
            amount: order.totalAppliedKd,
            branchId,
            actorUserId: actorId,
            sourceRef,
            note,
            createdAt: order.earliestCreatedAt,
          },
        });
        written += 1;
        console.log(
          '[BACKFILL_CREATED]',
          JSON.stringify({
            orderId: order.orderId,
            customerId: order.customerId,
            sourceRef,
            totalAppliedKd: order.totalAppliedKd.toFixed(4),
          }),
        );
      } catch (err) {
        const isUniqueViolation =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002';
        if (isUniqueViolation) {
          skippedExisting += 1;
          console.log(
            '[BACKFILL_DUPLICATE_SKIPPED]',
            JSON.stringify({
              orderId: order.orderId,
              customerId: order.customerId,
              sourceRef,
              cause: 'P2002 race',
            }),
          );
        } else {
          errored += 1;
          console.error(
            '[BACKFILL_ERROR]',
            JSON.stringify({
              orderId: order.orderId,
              customerId: order.customerId,
              sourceRef,
              message: (err as Error).message,
            }),
          );
        }
      }
    } else {
      written += 1; // would-be-written count
      console.log(
        '[BACKFILL_DRY_RUN]',
        JSON.stringify({
          orderId: order.orderId,
          customerId: order.customerId,
          sourceRef,
          totalAppliedKd: order.totalAppliedKd.toFixed(4),
        }),
      );
    }
  }

  // Step 3 — Phase 3 validation. After (or as if) the script ran,
  // SUM(TransactionHistory.appliedFromWallet) should equal
  // SUM(DebtLedgerEntry where sourceRef LIKE 'PAYMENT:WALLET:%').
  // For dry-run we project the post-write state (existing wallet
  // PAYMENT rows + would-write amount).
  const ledgerWalletRows = await prisma.debtLedgerEntry.findMany({
    where: {
      source: DebtSource.PAYMENT,
      sourceRef: { startsWith: 'PAYMENT:WALLET:' },
      ...(FILTER_CUSTOMER_ID ? { customerId: FILTER_CUSTOMER_ID } : {}),
    },
    select: { amount: true, sourceRef: true },
  });
  let totalLedgerWalletKd = new Prisma.Decimal(0);
  for (const row of ledgerWalletRows) {
    totalLedgerWalletKd = totalLedgerWalletKd.add(
      new Prisma.Decimal(row.amount.toString()),
    );
  }
  const projectedLedgerKd = APPLY
    ? totalLedgerWalletKd
    : totalLedgerWalletKd.add(
        Array.from(perOrder.values()).reduce(
          (acc, o) => acc.add(o.totalAppliedKd),
          new Prisma.Decimal(0),
        ),
      );
  const driftKd = totalAppliedFromTh.sub(projectedLedgerKd);
  if (driftKd.abs().greaterThan(new Prisma.Decimal('0.001'))) {
    console.warn(
      '[BACKFILL_MISMATCH]',
      JSON.stringify({
        sumAppliedFromWalletKd: totalAppliedFromTh.toFixed(4),
        sumLedgerWalletPaymentKd: projectedLedgerKd.toFixed(4),
        driftKd: driftKd.toFixed(4),
        note: APPLY
          ? 'Post-apply mismatch — investigate orphan TH rows or partial-row writes'
          : 'Dry-run projection mismatch — investigate orphan TH rows or partial-row writes',
      }),
    );
  } else {
    console.log(
      '[BACKFILL_VALIDATED]',
      JSON.stringify({
        sumAppliedFromWalletKd: totalAppliedFromTh.toFixed(4),
        sumLedgerWalletPaymentKd: projectedLedgerKd.toFixed(4),
      }),
    );
  }

  console.log(
    `Summary: scanned=${scanned} ordersWithWallet=${perOrder.size} ${APPLY ? 'written' : 'wouldWrite'}=${written} skippedExisting=${skippedExisting} errors=${errored} skippedNoWalletApplied=${skippedNoWalletApplied}`,
  );
}

main()
  .catch((err) => {
    console.error('[fatal]', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
