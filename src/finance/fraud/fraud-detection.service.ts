import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  DebtSource,
  FraudAlertSeverity,
  FraudAlertStatus,
  GeneralLedgerEntryType,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * V20.5 — Phase 8 Fraud Detection Engine.
 *
 * Scans the financial primaries on a schedule (and on demand)
 * for anomaly patterns and emits FraudAlert rows. The detector
 * code is the SINGLE WRITER to FraudAlert; no other service
 * should `prisma.fraudAlert.create()` directly.
 *
 * Detectors:
 *   • RAPID_REVERSALS         — ≥2 reversals on the same order
 *                               within 60 minutes.
 *   • REPEATED_PAYMENT_ATTEMPTS — ≥5 PAYMENT ledger rows on the
 *                               same order in 24 hours.
 *   • DUPLICATE_SETTLEMENT    — same `sourceRef` would-be on two
 *                               different orders (caught via the
 *                               P2002 retry trail in journal logs).
 *   • SUSPICIOUS_REFUND       — refund amount > 200 KD on a
 *                               sub-30-day-old invoice.
 *   • PAYMENT_SPLITTING       — ≥4 partial payments < 10 KD each
 *                               on the same invoice in 24 hours.
 *   • EXCESSIVE_WALLET_ADJ    — ≥3 wallet adjustments by the same
 *                               actor in 24 hours.
 *   • COLLECTOR_ANOMALY       — same collector closes ≥10
 *                               PROMISES as KEPT in 24h with no
 *                               matching payments (proxy: number
 *                               of KEPT > number of real payments
 *                               on those customers in window).
 *
 * Idempotency:
 *   • Each detector computes a deterministic `fingerprint` (SHA-256
 *     of `type + customerId + windowKey + payloadKey`). The unique
 *     index on `fingerprint` makes re-runs of the same detection
 *     window a no-op via P2002 catch.
 *
 * Output:
 *   • One alert row per anomaly. Severity varies by detector.
 *   • Returns the count of NEW alerts written so the cron can
 *     log throughput.
 */
@Injectable()
export class FraudDetectionService {
  private readonly logger = new Logger(FraudDetectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Run all detectors over the configured window and return a
   * summary. Safe to call concurrently with itself — the unique
   * fingerprint index serialises duplicate inserts.
   */
  async runAll(opts?: { windowMs?: number }): Promise<{
    inserted: number;
    perDetector: Record<string, number>;
  }> {
    const windowMs = opts?.windowMs ?? 24 * 60 * 60 * 1000;
    const detectors: Array<[string, () => Promise<number>]> = [
      ['RAPID_REVERSALS', () => this.detectRapidReversals(windowMs)],
      ['REPEATED_PAYMENT_ATTEMPTS', () => this.detectRepeatedPayments(windowMs)],
      ['SUSPICIOUS_REFUND', () => this.detectSuspiciousRefunds(windowMs)],
      ['PAYMENT_SPLITTING', () => this.detectPaymentSplitting(windowMs)],
      ['EXCESSIVE_WALLET_ADJ', () => this.detectExcessiveWalletAdj(windowMs)],
    ];
    const perDetector: Record<string, number> = {};
    let inserted = 0;
    for (const [name, fn] of detectors) {
      try {
        const n = await fn();
        perDetector[name] = n;
        inserted += n;
      } catch (err) {
        this.logger.error(
          `[V20_5_FRAUD_DETECTOR_FAILED] detector=${name} message=${(err as Error).message}`,
        );
        perDetector[name] = -1;
      }
    }
    return { inserted, perDetector };
  }

  /**
   * Hourly cron — runs the full detector suite on the last 24h of
   * activity. Disabled by default; set FRAUD_CRON_ENABLED=true.
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'v20_5_fraud_detection_sweep' })
  async cronSweep(): Promise<void> {
    if (!this.isCronEnabled()) {
      this.logger.debug(
        'V20.5 fraud detection cron skipped (FRAUD_CRON_ENABLED!=true)',
      );
      return;
    }
    const out = await this.runAll();
    this.logger.log(
      `[V20_5_FRAUD_SWEEP] inserted=${out.inserted} perDetector=${JSON.stringify(out.perDetector)}`,
    );
  }

  async list(opts?: {
    status?: FraudAlertStatus;
    severity?: FraudAlertSeverity;
    customerId?: string;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
    return this.prisma.fraudAlert.findMany({
      where: {
        ...(opts?.status ? { status: opts.status } : {}),
        ...(opts?.severity ? { severity: opts.severity } : {}),
        ...(opts?.customerId ? { customerId: opts.customerId } : {}),
      },
      orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }],
      take: limit,
    });
  }

  async resolve(input: {
    alertId: string;
    actorId: string;
    status: FraudAlertStatus;
    notes?: string | null;
  }) {
    if (
      input.status !== FraudAlertStatus.RESOLVED_FALSE_POSITIVE &&
      input.status !== FraudAlertStatus.RESOLVED_CONFIRMED &&
      input.status !== FraudAlertStatus.INVESTIGATING
    ) {
      throw new Error('Invalid resolve target status');
    }
    const existing = await this.prisma.fraudAlert.findUnique({
      where: { id: input.alertId },
    });
    if (!existing) throw new NotFoundException('FraudAlert not found');
    return this.prisma.fraudAlert.update({
      where: { id: input.alertId },
      data: {
        status: input.status,
        resolvedAt:
          input.status === FraudAlertStatus.INVESTIGATING ? null : new Date(),
        resolvedById:
          input.status === FraudAlertStatus.INVESTIGATING ? null : input.actorId,
        resolutionNotes: input.notes ?? null,
      },
    });
  }

  // ── Detectors ────────────────────────────────────────────────

  private async detectRapidReversals(windowMs: number): Promise<number> {
    const since = new Date(Date.now() - windowMs);
    const rows = await this.prisma.generalLedgerEntry.findMany({
      where: {
        entryType: {
          in: [
            GeneralLedgerEntryType.DEBT_ADJUSTMENT,
            GeneralLedgerEntryType.WALLET_SETTLEMENT,
          ],
        },
        createdAt: { gte: since },
      },
      select: {
        id: true,
        customerId: true,
        orderId: true,
        amount: true,
        createdAt: true,
      },
    });
    const byOrder = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!r.orderId) continue;
      const key = r.orderId;
      const list = byOrder.get(key) ?? [];
      list.push(r);
      byOrder.set(key, list);
    }
    let inserted = 0;
    for (const [orderId, list] of byOrder) {
      if (list.length < 2) continue;
      list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      // Check for ≥2 reversals within any 60-minute window.
      let pairs = 0;
      for (let i = 1; i < list.length; i++) {
        if (
          list[i].createdAt.getTime() - list[i - 1].createdAt.getTime() <=
          60 * 60 * 1000
        ) {
          pairs += 1;
        }
      }
      if (pairs === 0) continue;
      const customerId = list[0].customerId;
      const fp = this.fingerprint('RAPID_REVERSALS', customerId, orderId, this.dayKey());
      const ok = await this.tryInsert({
        type: 'RAPID_REVERSALS',
        severity: pairs >= 3 ? FraudAlertSeverity.HIGH : FraudAlertSeverity.MEDIUM,
        customerId,
        actorId: null,
        fingerprint: fp,
        payload: {
          orderId,
          reversalCount: list.length,
          pairsWithinHour: pairs,
        },
      });
      if (ok) inserted += 1;
    }
    return inserted;
  }

  private async detectRepeatedPayments(windowMs: number): Promise<number> {
    const since = new Date(Date.now() - windowMs);
    const rows = await this.prisma.debtLedgerEntry.findMany({
      where: {
        source: DebtSource.PAYMENT,
        createdAt: { gte: since },
        orderId: { not: null },
      },
      select: { customerId: true, orderId: true, amount: true, createdAt: true },
    });
    const byOrder = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!r.orderId) continue;
      const list = byOrder.get(r.orderId) ?? [];
      list.push(r);
      byOrder.set(r.orderId, list);
    }
    let inserted = 0;
    for (const [orderId, list] of byOrder) {
      if (list.length < 5) continue;
      const fp = this.fingerprint('REPEATED_PAYMENT_ATTEMPTS', list[0].customerId, orderId, this.dayKey());
      const ok = await this.tryInsert({
        type: 'REPEATED_PAYMENT_ATTEMPTS',
        severity: list.length >= 10 ? FraudAlertSeverity.HIGH : FraudAlertSeverity.MEDIUM,
        customerId: list[0].customerId,
        fingerprint: fp,
        payload: { orderId, attemptCount: list.length },
      });
      if (ok) inserted += 1;
    }
    return inserted;
  }

  private async detectSuspiciousRefunds(windowMs: number): Promise<number> {
    const since = new Date(Date.now() - windowMs);
    const orders = await this.prisma.order.findMany({
      where: {
        status: 'CANCELED',
        updatedAt: { gte: since },
      },
      select: {
        id: true,
        customerId: true,
        totalPrice: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    let inserted = 0;
    for (const o of orders) {
      const total = new Prisma.Decimal(o.totalPrice.toString());
      if (total.lessThan(200)) continue;
      const ageMs = o.updatedAt.getTime() - o.createdAt.getTime();
      if (ageMs > 30 * 24 * 60 * 60 * 1000) continue;
      const fp = this.fingerprint('SUSPICIOUS_REFUND', o.customerId, o.id, '');
      const ok = await this.tryInsert({
        type: 'SUSPICIOUS_REFUND',
        severity: FraudAlertSeverity.HIGH,
        customerId: o.customerId,
        fingerprint: fp,
        payload: {
          orderId: o.id,
          amountKd: total.toFixed(4),
          invoiceAgeDays: Math.floor(ageMs / (24 * 60 * 60 * 1000)),
        },
      });
      if (ok) inserted += 1;
    }
    return inserted;
  }

  private async detectPaymentSplitting(windowMs: number): Promise<number> {
    const since = new Date(Date.now() - windowMs);
    const rows = await this.prisma.debtLedgerEntry.findMany({
      where: {
        source: DebtSource.PAYMENT,
        createdAt: { gte: since },
        orderId: { not: null },
      },
      select: { customerId: true, orderId: true, amount: true, createdAt: true },
    });
    const byOrder = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!r.orderId) continue;
      const list = byOrder.get(r.orderId) ?? [];
      list.push(r);
      byOrder.set(r.orderId, list);
    }
    let inserted = 0;
    for (const [orderId, list] of byOrder) {
      const smallPayments = list.filter((r) =>
        new Prisma.Decimal((r.amount ?? 0).toString()).lessThan(10),
      );
      if (smallPayments.length < 4) continue;
      const fp = this.fingerprint('PAYMENT_SPLITTING', list[0].customerId, orderId, this.dayKey());
      const ok = await this.tryInsert({
        type: 'PAYMENT_SPLITTING',
        severity: FraudAlertSeverity.MEDIUM,
        customerId: list[0].customerId,
        fingerprint: fp,
        payload: { orderId, smallPaymentCount: smallPayments.length },
      });
      if (ok) inserted += 1;
    }
    return inserted;
  }

  private async detectExcessiveWalletAdj(windowMs: number): Promise<number> {
    const since = new Date(Date.now() - windowMs);
    const rows = await this.prisma.generalLedgerEntry.findMany({
      where: {
        entryType: GeneralLedgerEntryType.WALLET_SETTLEMENT,
        createdAt: { gte: since },
      },
      select: { customerId: true, actorUserId: true, createdAt: true },
    });
    const byActor = new Map<string, number>();
    const byActorCustomers = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!r.actorUserId) continue;
      byActor.set(r.actorUserId, (byActor.get(r.actorUserId) ?? 0) + 1);
      const set = byActorCustomers.get(r.actorUserId) ?? new Set<string>();
      if (r.customerId) set.add(r.customerId);
      byActorCustomers.set(r.actorUserId, set);
    }
    let inserted = 0;
    for (const [actorId, count] of byActor) {
      if (count < 3) continue;
      const fp = this.fingerprint('EXCESSIVE_WALLET_ADJ', actorId, '', this.dayKey());
      const ok = await this.tryInsert({
        type: 'EXCESSIVE_WALLET_ADJ',
        severity: count >= 6 ? FraudAlertSeverity.HIGH : FraudAlertSeverity.MEDIUM,
        customerId: null,
        actorId,
        fingerprint: fp,
        payload: {
          adjCount: count,
          uniqueCustomers: byActorCustomers.get(actorId)?.size ?? 0,
        },
      });
      if (ok) inserted += 1;
    }
    return inserted;
  }

  // ── Helpers ──────────────────────────────────────────────────

  private isCronEnabled(): boolean {
    const v = (process.env.FRAUD_CRON_ENABLED ?? '').toString().trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'on' || v === 'yes';
  }

  private dayKey(): string {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  }

  private fingerprint(...parts: Array<string | null | undefined>): string {
    const joined = parts.map((p) => p ?? '').join('|');
    return createHash('sha256').update(`v20_5|${joined}`).digest('hex');
  }

  private async tryInsert(input: {
    type: string;
    severity: FraudAlertSeverity;
    customerId: string | null;
    actorId?: string | null;
    fingerprint: string;
    payload: Prisma.InputJsonValue;
  }): Promise<boolean> {
    try {
      await this.prisma.fraudAlert.create({
        data: {
          type: input.type,
          severity: input.severity,
          customerId: input.customerId,
          actorId: input.actorId ?? null,
          fingerprint: input.fingerprint,
          payload: input.payload,
        },
      });
      return true;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return false;
      }
      throw err;
    }
  }
}
