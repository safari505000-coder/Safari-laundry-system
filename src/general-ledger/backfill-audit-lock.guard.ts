import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * حارس قفل التدقيق للبيانات المُرتَّجَعة — الإصدار V20.1 المرحلة 21.
 *
 * يعمل عند تشغيل التطبيق (`OnApplicationBootstrap`) ويتحقق من سلامة
 * البيانات المالية قبل قبول أي طلبات. إذا وُجد سجل `BackfillAuditLock`
 * مُفعَّل (`isLocked = true`)، يُعيد حساب بصمات `DebtLedgerEntry` و`CustomerWallet`
 * ويقارنها بالمخزّن — وعند عدم التطابق يُوقف العملية (`process.exit(2)`)
 * لمنع خدمة بيانات فاسدة.
 *
 * للتجاوز أثناء ترحيل مقصود: `BACKFILL_AUDIT_LOCK_BYPASS=true`.
 * البصمات خشنة متعمدًا (SHA-256 مُقتطَع) — كافية للكشف عن أي تغيير مالي
 * وسريعة بما يكفي لاستكمال التشغيل خلال ~1 ثانية.
 *
 * V20.1 Phase 21 backfill validation lock guard.
 *
 * Runs at application bootstrap to verify financial data integrity before
 * accepting traffic. If `BackfillAuditLock.isLocked = true`, recomputes
 * checksums for `DebtLedgerEntry` and `CustomerWallet` and compares against
 * the stored values — a mismatch aborts the process (`process.exit(2)`).
 *
 * Bypass during intentional migrations: `BACKFILL_AUDIT_LOCK_BYPASS=true`.
 * Checksums are coarse by design (truncated SHA-256) — sensitive enough
 * to detect any financial mutation, fast enough to complete at boot in ~1s.
 *
 * @since V20.1
 */
@Injectable()
export class BackfillAuditLockGuard implements OnApplicationBootstrap {
  private readonly logger = new Logger(BackfillAuditLockGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * يُنفَّذ تلقائيًا عند تشغيل التطبيق. يقرأ سجل `BackfillAuditLock` ويُعيد حساب
   * بصمات جداول الديون والمحافظ ويُقارنها. في حال التناقض يُوقف العملية بكود `2`.
   * إذا لم يوجد سجل أو كان `isLocked = false` يمر الاختبار بشكل صامت.
   *
   * Runs automatically at application bootstrap. Reads the `BackfillAuditLock`
   * singleton, recomputes ledger and wallet checksums, and compares them against
   * stored values. Aborts with exit code 2 on mismatch. Passes silently if no
   * lock exists or `isLocked = false`.
   *
   * @since V20.1
   */
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
   * يحسب بصمة SHA-256 خشنة لدفتر الديون (`DebtLedgerEntry`).
   * يُجمِّع صافي الذمم لكل عميل (مديونية − مدفوعات) ويُشفِّر القائمة المُرتَّبة.
   * أي تغيير في صافي ذمة أي عميل يُغيِّر البصمة وينكشف عند التحقق.
   *
   * Computes a coarse SHA-256 checksum of the `DebtLedgerEntry` book.
   * Aggregates net AR per customer (shortfall+overuse − non-wallet payments)
   * and hashes the sorted result. Any net change to any customer's AR
   * position changes the checksum and is detected at boot.
   *
   * @returns أول 32 حرف من SHA-256 | First 32 chars of SHA-256 hex
   * @since V20.1
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
   * يحسب بصمة SHA-256 خشنة لجدول المحافظ (`CustomerWallet`).
   * يُشفِّر أزواج (customerId, balance, debt) المُرتَّبة بدقة 4 منازل عشرية.
   * أي تغيير في رصيد محفظة أي عميل يُغيِّر البصمة.
   *
   * Computes a coarse SHA-256 checksum of the `CustomerWallet` table.
   * Hashes sorted (customerId, balance, debt) tuples at 4dp precision.
   * Any wallet balance change changes the checksum.
   *
   * @returns أول 32 حرف من SHA-256 | First 32 chars of SHA-256 hex
   * @since V20.1
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
   * يُنشئ أو يُحدِّث سجل القفل بعد ترحيل ناجح لـ"تجميد" البصمات الحالية.
   * لا يُكشَف عبر REST — يُستخدم فقط من سكريبتات الترحيل والأدوات الداخلية.
   *
   * Creates or updates the audit lock record after a successful backfill,
   * "freezing" the current checksums as the baseline for future boot checks.
   * Not exposed via REST — internal tooling only.
   *
   * @param actorUserId - معرف المستخدم المُنفِّذ للترحيل | ID of the migration actor
   * @param note - ملاحظة توضيحية تُخزَّن مع سجل القفل | Descriptive note stored with the lock
   * @since V20.1
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
