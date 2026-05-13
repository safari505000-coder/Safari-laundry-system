import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  CommissionMode,
  CommissionPayoutTiming,
  OrderStatus,
  SystemToggleKey,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { CommissionEarningService } from './commission-earning.service';
import {
  computeOrderRemainingBalancesBatch,
  isJournalAsSourceEnabled,
} from '../finance/debt-customer-aggregates.util';

/**
 * V19.16 — idempotent cron that turns existing Order / DebtLedger
 * writes into CommissionPayout rows without us having to patch every
 * call site that marks an order COMPLETED or inserts a PAYMENT ledger
 * entry. The unique indexes on
 *   • (sourceOrderId, ruleId, earnerUserId)
 *   • (sourceDebtEntryId, ruleId, earnerUserId)
 * guarantee safe replay: a second scan over the same window produces
 * zero new rows.
 *
 * Three responsibilities:
 *   1. Earn on any order completed in the last N minutes (SALE).
 *   2. Earn on any PAYMENT debt entry created in the last N minutes
 *      (COLLECTION).
 *   3. Release AFTER_COLLECTION payouts once the underlying order
 *      has zero open debt, and END_OF_MONTH payouts at day-boundary
 *      cron ticks.
 *
 * Controlled by the COMMISSION master toggle; a single `isEnabled`
 * check gates the whole cron so Owner can disable commissions instantly.
 */
@Injectable()
export class CommissionEarningCron {
  private readonly logger = new Logger(CommissionEarningCron.name);
  /**
   * Look-back window per tick. Kept wider than the tick interval so a
   * missed run (restart, deploy) still catches up on the next one.
   */
  private static readonly SCAN_MINUTES = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly earning: CommissionEarningService,
    private readonly settings: SystemSettingsService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async scan(): Promise<void> {
    const enabled = await this.settings.isEnabled(SystemToggleKey.COMMISSION);
    if (!enabled) return;

    const since = new Date(
      Date.now() - CommissionEarningCron.SCAN_MINUTES * 60_000,
    );

    try {
      await this.scanCompletedOrders(since);
    } catch (err) {
      this.logger.error(
        `SALE scan failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
    try {
      await this.scanJournalPayments(since);
    } catch (err) {
      this.logger.error(
        `COLLECTION scan failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
    try {
      await this.releaseAfterCollection(since);
    } catch (err) {
      this.logger.error(
        `AFTER_COLLECTION release failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  /**
   * End-of-month release, ticking at 00:05 Kuwait-local (UTC+3 = 21:05
   * UTC the previous day). Using a daily cron and passing `now` is
   * enough: the underlying updateMany is idempotent and only touches
   * rows with `earnedAt <= now` matching the END_OF_MONTH timing.
   */
  @Cron('5 21 * * *')
  async scanEndOfMonth(): Promise<void> {
    const enabled = await this.settings.isEnabled(SystemToggleKey.COMMISSION);
    if (!enabled) return;
    const count = await this.earning.releaseEndOfMonth(new Date());
    if (count > 0) {
      this.logger.log(`Released ${count} END_OF_MONTH commission payouts`);
    }
  }

  // ─── Internals ────────────────────────────────────────────────────

  private async scanCompletedOrders(since: Date): Promise<void> {
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.COMPLETED,
        completedAt: { gte: since },
      },
      select: { id: true },
      take: 500,
    });
    if (orders.length === 0) return;
    let earned = 0;
    for (const o of orders) {
      try {
        await this.earning.earnForOrder(o.id);
        earned++;
      } catch (err) {
        this.logger.warn(
          `earnForOrder(${o.id}) failed: ${(err as Error).message}`,
        );
      }
    }
    this.logger.debug(
      `SALE scan processed ${orders.length} orders (earned ${earned})`,
    );
  }

  /**
   * V20.4 — Scans JournalEntry instead of DebtLedgerEntry for COLLECTION
   * commissions. JournalEntry.source='PAYMENT' with orderId set corresponds
   * to a real cash / KNET / online debt payment mirrored by the banking core.
   */
  private async scanJournalPayments(since: Date): Promise<void> {
    const entries = await this.prisma.journalEntry.findMany({
      where: {
        source: 'PAYMENT',
        orderId: { not: null },
        createdAt: { gte: since },
      },
      select: { id: true },
      take: 500,
    });
    if (entries.length === 0) return;
    let earned = 0;
    for (const e of entries) {
      try {
        await this.earning.earnForJournalPayment(e.id);
        earned++;
      } catch (err) {
        this.logger.warn(
          `earnForJournalPayment(${e.id}) failed: ${(err as Error).message}`,
        );
      }
    }
    this.logger.debug(
      `COLLECTION scan processed ${entries.length} journal PAYMENTs (earned ${earned})`,
    );
  }

  /**
   * Detect orders whose debt just cleared in the last window and
   * promote any AFTER_COLLECTION-timed PENDING payouts tied to them.
   * We look for orders that (a) have SALE payouts still PENDING with
   * AFTER_COLLECTION timing and (b) have zero open debt remaining.
   */
  private async releaseAfterCollection(since: Date): Promise<void> {
    // Candidates = orders that have at least one PENDING payout with
    // AFTER_COLLECTION timing. Narrow by recent activity so the cron
    // stays cheap.
    const candidates = await this.prisma.commissionPayout.findMany({
      where: {
        mode: CommissionMode.SALE,
        status: 'PENDING',
        rule: { payoutTiming: CommissionPayoutTiming.AFTER_COLLECTION },
        sourceOrderId: { not: null },
      },
      select: { sourceOrderId: true },
      distinct: ['sourceOrderId'],
      take: 200,
    });
    void since; // reserved for a future activity-window filter

    for (const c of candidates) {
      if (!c.sourceOrderId) continue;

      // V20.4 — Journal path: per-order net on 1300 (from R3) tells us
      // whether the order is cleared without reading DebtLedger.
      if (isJournalAsSourceEnabled()) {
        const remMap = await computeOrderRemainingBalancesBatch(this.prisma, [
          c.sourceOrderId,
        ]);
        const rem = remMap.get(c.sourceOrderId)?.toNumber() ?? 0;
        if (rem <= 0.001) {
          await this.earning.releaseAfterCollectionForOrder(c.sourceOrderId);
        }
        continue;
      }

      const remMapFallback = await computeOrderRemainingBalancesBatch(this.prisma, [
        c.sourceOrderId,
      ]);
      const remFallback = remMapFallback.get(c.sourceOrderId)?.toNumber() ?? 0;
      if (remFallback <= 0.001) {
        await this.earning.releaseAfterCollectionForOrder(c.sourceOrderId);
      }
    }
  }
}
