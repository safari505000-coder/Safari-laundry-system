/**
 * V20.3 — Phase 31 backfill: full-invoice issuance journal entries.
 *
 * Background
 * ----------
 * Pre-V20.3, the journal was only debited for the post-wallet
 * SHORTFALL remainder when an order had one. Under V20.3
 * (true-accounting), every order issuance writes
 *
 *   DR ACCOUNTS_RECEIVABLE = totalPrice
 *   CR REVENUE             = totalPrice
 *
 * via {@link DoubleEntryJournalService.appendInvoiceIssuanceEntry}.
 * Existing orders need the same row produced retroactively so that
 * after flipping `V20_3_TRUE_ACCOUNTING=true`:
 *
 *   journalAR(customer)
 *     = Σ(issuance) − Σ(wallet absorption v3) − Σ(external payment)
 *
 * matches the customer's actual debt the same way the live
 * Phase 29 lockstep enforces it.
 *
 * Idempotency
 * -----------
 * `appendInvoiceIssuanceEntry` keys on
 * `JOURNAL:INVOICE_ISSUED:<orderId>`. The unique index on
 * `JournalEntry.sourceRef` makes the second run a no-op (the
 * service does a `findUnique` first and short-circuits when the
 * row exists). Safe to re-run.
 *
 * Scope
 * -----
 * Walks every Order with `status != CANCELED` AND `totalPrice > 0`.
 * Skips orders with no resolvable customer (legacy walk-in
 * placeholders). Optional `--customer <uuid>` for targeted
 * backfill during validation.
 *
 * Modes
 * -----
 *   npx tsx scripts/backfill-v20-3-true-accounting.ts            # dry-run (default)
 *   npx tsx scripts/backfill-v20-3-true-accounting.ts --apply    # actually write
 *   npx tsx scripts/backfill-v20-3-true-accounting.ts --customer <uuid>   # one customer
 *
 * Logging
 * -------
 *   [V20_3_BACKFILL_CREATED]            — issuance entry inserted
 *   [V20_3_BACKFILL_DUPLICATE_SKIPPED]  — entry already exists
 *   [V20_3_BACKFILL_SKIPPED]            — order ineligible (no customer / cancelled / zero)
 *   [V20_3_BACKFILL_FAILED]             — write failed; investigate
 *   [V20_3_BACKFILL_SUMMARY]            — final counts
 */
import 'dotenv/config';
import { OrderStatus, Prisma, PrismaClient, SafariRole } from '@prisma/client';

const APPLY = process.argv.includes('--apply');
const customerArgIndex = process.argv.indexOf('--customer');
const FILTER_CUSTOMER_ID =
  customerArgIndex >= 0 && process.argv[customerArgIndex + 1]
    ? process.argv[customerArgIndex + 1]
    : null;

const prisma = new PrismaClient();

async function resolveActorId(): Promise<string> {
  const owner = await prisma.user.findFirst({
    where: { safariRole: SafariRole.OWNER },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!owner) {
    throw new Error(
      'V20_3 BACKFILL: no OWNER user available to attribute issuance entries',
    );
  }
  return owner.id;
}

async function main(): Promise<void> {
  const actorUserId = await resolveActorId();
  // eslint-disable-next-line no-console
  console.log(
    `V20_3 BACKFILL — apply=${APPLY} customerFilter=${FILTER_CUSTOMER_ID ?? 'ALL'} actor=${actorUserId}`,
  );

  let createdCount = 0;
  let duplicateCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  let cursor: string | undefined = undefined;
  const PAGE_SIZE = 500;
  // Walk orders in id-asc order so we can paginate without
  // pulling the whole table into memory.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const orders: Array<{
      id: string;
      customerId: string | null;
      totalPrice: Prisma.Decimal;
      status: OrderStatus;
    }> = await prisma.order.findMany({
      where: {
        status: { not: OrderStatus.CANCELED },
        ...(FILTER_CUSTOMER_ID ? { customerId: FILTER_CUSTOMER_ID } : {}),
      },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        customerId: true,
        totalPrice: true,
        status: true,
      },
    });
    if (orders.length === 0) break;
    cursor = orders[orders.length - 1].id;

    for (const o of orders) {
      if (!o.customerId) {
        skippedCount += 1;
        // eslint-disable-next-line no-console
        console.log(
          '[V20_3_BACKFILL_SKIPPED]',
          JSON.stringify({ orderId: o.id, reason: 'NO_CUSTOMER' }),
        );
        continue;
      }
      const total = new Prisma.Decimal(o.totalPrice.toString());
      if (total.lessThanOrEqualTo(0)) {
        skippedCount += 1;
        // eslint-disable-next-line no-console
        console.log(
          '[V20_3_BACKFILL_SKIPPED]',
          JSON.stringify({
            orderId: o.id,
            reason: 'NON_POSITIVE_TOTAL',
            totalPrice: total.toFixed(4),
          }),
        );
        continue;
      }

      const sourceRef = `JOURNAL:INVOICE_ISSUED:${o.id}`;
      const existing = await prisma.journalEntry.findUnique({
        where: { sourceRef },
        select: { id: true },
      });
      if (existing) {
        duplicateCount += 1;
        // eslint-disable-next-line no-console
        console.log(
          '[V20_3_BACKFILL_DUPLICATE_SKIPPED]',
          JSON.stringify({ orderId: o.id, sourceRef, journalId: existing.id }),
        );
        continue;
      }

      if (!APPLY) {
        // Dry-run: just count what we would write.
        createdCount += 1;
        // eslint-disable-next-line no-console
        console.log(
          '[V20_3_BACKFILL_DRY_RUN]',
          JSON.stringify({
            orderId: o.id,
            customerId: o.customerId,
            totalPrice: total.toFixed(4),
          }),
        );
        continue;
      }

      try {
        // Resolve account ids on the fly (avoid hardcoding in this
        // script; matches DoubleEntryJournalService.appendBalanced
        // shape exactly).
        const accounts = await prisma.account.findMany({
          where: { code: { in: ['1300', '4100'] }, isActive: true },
          select: { id: true, code: true },
        });
        const accountByCode = new Map(accounts.map((a) => [a.code, a.id]));
        const arId = accountByCode.get('1300');
        const revenueId = accountByCode.get('4100');
        if (!arId || !revenueId) {
          failedCount += 1;
          // eslint-disable-next-line no-console
          console.error(
            '[V20_3_BACKFILL_FAILED]',
            JSON.stringify({
              orderId: o.id,
              reason: 'MISSING_SEEDED_ACCOUNT',
              accounts: accounts.map((a) => a.code),
            }),
          );
          continue;
        }
        await prisma.journalEntry.create({
          data: {
            source: 'INVOICE_ISSUED',
            sourceRef,
            actorUserId,
            customerId: o.customerId,
            orderId: o.id,
            lines: {
              create: [
                {
                  accountId: arId,
                  debit: total,
                  meta: {
                    event: 'INVOICE_ISSUED',
                    orderId: o.id,
                    backfilled: true,
                  },
                },
                {
                  accountId: revenueId,
                  credit: total,
                  meta: {
                    event: 'INVOICE_ISSUED',
                    orderId: o.id,
                    backfilled: true,
                  },
                },
              ],
            },
          },
          select: { id: true },
        });
        createdCount += 1;
        // eslint-disable-next-line no-console
        console.log(
          '[V20_3_BACKFILL_CREATED]',
          JSON.stringify({
            orderId: o.id,
            customerId: o.customerId,
            totalPrice: total.toFixed(4),
            sourceRef,
          }),
        );
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          duplicateCount += 1;
          // eslint-disable-next-line no-console
          console.log(
            '[V20_3_BACKFILL_DUPLICATE_SKIPPED]',
            JSON.stringify({
              orderId: o.id,
              sourceRef,
              reason: 'P2002_RACE',
            }),
          );
          continue;
        }
        failedCount += 1;
        // eslint-disable-next-line no-console
        console.error(
          '[V20_3_BACKFILL_FAILED]',
          JSON.stringify({
            orderId: o.id,
            sourceRef,
            message: (err as Error)?.message ?? String(err),
          }),
        );
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    '[V20_3_BACKFILL_SUMMARY]',
    JSON.stringify({
      apply: APPLY,
      customerFilter: FILTER_CUSTOMER_ID,
      created: createdCount,
      duplicates: duplicateCount,
      skipped: skippedCount,
      failed: failedCount,
    }),
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('V20_3 BACKFILL FATAL', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
