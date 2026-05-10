import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * V20.1-v4 — Phase 21 backfill validation lock.
 *
 * Singleton guard that runs at application bootstrap. If the
 * `BackfillAuditLock` row exists with `isLocked = true`, the
 * stored `checksumLedger` and `checksumWallet` are recomputed
 * and compared. On mismatch the process aborts (`process.exit(2)`)
 * so a corrupted dataset cannot serve traffic.
 *
 * Bypass with env `BACKFILL_AUDIT_LOCK_BYPASS=true` (e.g. during
 * a legitimate migration that's expected to change the checksums).
 *
 * Checksums are deliberately coarse (truncated SHA-256 of the
 * sorted aggregate sums) — fine enough to detect any committed
 * change to the financial tables, fast enough to compute at boot
 * without delaying startup more than ~1s.
 */
@Injectable()
export class BackfillAuditLockGuard implements OnApplicationBootstrap {
  private readonly logger = new Logger(BackfillAuditLockGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.BACKFILL_AUDIT_LOCK_BYPASS === 'true') {
      this.logger.warn(
        '[BACKFILL_AUDIT_LOCK_BYPASSED] env BACKFILL_AUDIT_LOCK_BYPASS=true — skipping checksum verification',
      );
      return;
    }

    let lock: { isLocked: boolean; checksumLedger: string | null; checksumWallet: string | null } | null = null;
    try {
      lock = await this.prisma.backfillAuditLock.findUnique({
        where: { id: 'singleton' },
        select: { isLocked: true, checksumLedger: true, checksumWallet: true },
      });
    } catch (err) {
      this.logger.error(
        `[BACKFILL_AUDIT_LOCK_READ_FAILED] ${(err as Error).message} — boot continues (no lock to compare against)`,
      );
      return;
    }

    if (!lock || !lock.isLocked) {
      this.logger.log(
        '[BACKFILL_AUDIT_LOCK_INACTIVE] No active lock — boot continues',
      );
      return;
    }

    try {
      const liveLedger = await this.computeLedgerChecksum();
      const liveWallet = await this.computeWalletChecksum();
      if (
        lock.checksumLedger !== liveLedger ||
        lock.checksumWallet !== liveWallet
      ) {
        this.logger.error(
          `[BACKFILL_AUDIT_LOCK_MISMATCH] storedLedger=${lock.checksumLedger} liveLedger=${liveLedger} storedWallet=${lock.checksumWallet} liveWallet=${liveWallet}`,
        );
        // Hard abort: refuse to serve traffic on a corrupted dataset.
        // Bypass with BACKFILL_AUDIT_LOCK_BYPASS=true if intentional.
        process.exit(2);
      }
      this.logger.log(
        `[BACKFILL_AUDIT_LOCK_OK] ledger=${liveLedger} wallet=${liveWallet}`,
      );
    } catch (err) {
      this.logger.error(
        `[BACKFILL_AUDIT_LOCK_VERIFY_FAILED] ${(err as Error).message} — boot continues but lock could not be verified`,
      );
    }
  }

  /**
   * Compute a coarse checksum of the DebtLedgerEntry book.
   * Aggregates per-customer sums of SHORTFALL+OVERUSE-PAYMENT and
   * hashes the sorted result. Detects ANY net change to a customer's
   * AR position.
   */
  async computeLedgerChecksum(): Promise<string> {
    const rows = await this.prisma.$queryRaw<
      { customerId: string; net: string }[]
    >`
      SELECT
        dle."customerId" AS "customerId",
        COALESCE(SUM(
          CASE
            WHEN dle."source" IN ('INVOICE_SHORTFALL', 'SUBSCRIPTION_OVERUSE') THEN dle."amount"
            WHEN dle."source" = 'PAYMENT' AND dle."sourceRef" NOT LIKE 'PAYMENT:WALLET:%' THEN -dle."amount"
            ELSE 0
          END
        ), 0)::text AS net
      FROM "DebtLedgerEntry" dle
      GROUP BY dle."customerId"
      ORDER BY dle."customerId" ASC
    `;
    const hash = createHash('sha256');
    for (const r of rows) {
      hash.update(`${r.customerId}|${r.net}\n`);
    }
    return hash.digest('hex').slice(0, 32);
  }

  /**
   * Compute a coarse checksum of the CustomerWallet book.
   * Hashes the sorted (customerId, balance, debt) tuples.
   */
  async computeWalletChecksum(): Promise<string> {
    const rows = await this.prisma.customerWallet.findMany({
      orderBy: { customerId: 'asc' },
      select: { customerId: true, balance: true, debt: true },
    });
    const hash = createHash('sha256');
    for (const r of rows) {
      hash.update(
        `${r.customerId}|${new Prisma.Decimal(r.balance.toString()).toFixed(4)}|${new Prisma.Decimal(r.debt.toString()).toFixed(4)}\n`,
      );
    }
    return hash.digest('hex').slice(0, 32);
  }

  /**
   * Acquire the lock — typically called by the backfill script
   * after a successful run to "freeze" the dataset's checksums.
   * NOT exposed via REST; only used by tooling.
   */
  async acquireLock(actorUserId: string, note: string): Promise<void> {
    const checksumLedger = await this.computeLedgerChecksum();
    const checksumWallet = await this.computeWalletChecksum();
    await this.prisma.backfillAuditLock.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        isLocked: true,
        checksumLedger,
        checksumWallet,
        lockedAt: new Date(),
        lockedByActorId: actorUserId,
        note,
      },
      update: {
        isLocked: true,
        checksumLedger,
        checksumWallet,
        lockedAt: new Date(),
        lockedByActorId: actorUserId,
        note,
      },
    });
  }
}
