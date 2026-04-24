import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { KUWAIT_TIMEZONE } from '../common/time/kuwait-time';
import { SerialCounterService } from './serial-counter.service';

/**
 * Serial-gap monitor (Dastur §3.8) — V19.24 per-operator sequences.
 *
 * After V19.24, each `User` with a `driverPrefix` has their own
 * `SerialCounter` key `OU_<userId>`. A gap in **that** stream (a missing
 * `prefix-<i>` for `1 ≤ i ≤ C` where `C` is the per-user high mark) can
 * only appear if an `Order` was hard-deleted (or a serial was tampered) —
 * the same business meaning as the old global `ORDER_SERIAL` check.
 *
 * The service has two entry points:
 *   • `@Cron('5 0 * * *', Asia/Kuwait)` — runs at 00:05 local, right after
 *     the shift cycle roll, and writes an `AuditLog` row whenever gaps are
 *     detected. The log row is the single source of truth for the Owner UI.
 *   • `scanNow()` — same pipeline, invoked on demand by `POST
 *     /owner/serials/gaps/scan-now` (OWNER only) for ad-hoc audits.
 *
 * Payload shape mirrors `GapReport`; the audit log `changes` JSON stores
 * the same object so the Owner can scroll through history.
 */

export interface GapReport {
  scannedAtIso: string;
  /** Sum of per-operator high marks `C` (each is max(counter row, max suffix in DB for that user)). */
  currentCounter: number;
  /** Sum, across operators, of how many integers in `1..C` are covered by a live order. */
  presentCount: number;
  gapCount: number;
  /** Up to 50 — full serial strings like `A-3` (not bare integers). */
  firstGaps: string[];
  allGapsTruncated: boolean;
}

const GAP_SAMPLE_LIMIT = 50;
const AUDIT_ACTION_GAP = 'ORDER_SERIAL_GAP_DETECTED';
const AUDIT_ACTION_CLEAN = 'ORDER_SERIAL_GAP_SCAN_CLEAN';
const AUDIT_RESOURCE = '/owner/serials/gaps';

@Injectable()
export class SerialGapService {
  private readonly logger = new Logger(SerialGapService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Kuwait 00:05 daily. The 5-minute offset guarantees the shift cycle
   * cron (`0 0 * * *`) has already closed yesterday's shifts before we
   * scan — keeps the two jobs from racing on the same orders table.
   */
  @Cron('5 0 * * *', { timeZone: KUWAIT_TIMEZONE })
  async handleCron(): Promise<void> {
    try {
      const report = await this.runDailyCheck();
      if (report.gapCount > 0) {
        this.logger.warn(
          `[SERIAL-GAP] ${report.gapCount} gap(s) across per-operator serials; aggregateHighMark=${report.currentCounter}`,
        );
      }
    } catch (err) {
      this.logger.error(`[SERIAL-GAP] daily scan failed: ${String(err)}`);
    }
  }

  /**
   * Scan + persist. The audit row is written inside a fire-and-forget
   * wrapper by the caller to keep scanning cheap; here we always write
   * so the Owner can see "scan ran, was clean" as well.
   */
  async runDailyCheck(): Promise<GapReport> {
    const report = await this.scanGaps();
    await this.recordScanAudit(report);
    return report;
  }

  /** OWNER manual trigger — same pipeline, exposed via controller. */
  scanNow(): Promise<GapReport> {
    return this.runDailyCheck();
  }

  /**
   * Pure read — computes the report without touching AuditLog. The Owner
   * UI uses this only if it wants a live recount; the primary surface is
   * the `latestReport()` audit read below.
   */
  async scanGaps(): Promise<GapReport> {
    const scannedAtIso = new Date().toISOString();
    const operators = await this.prisma.user.findMany({
      where: { driverPrefix: { not: null } },
      select: { id: true, driverPrefix: true },
    });

    let currentCounter = 0;
    let presentCount = 0;
    let gapCount = 0;
    const firstGaps: string[] = [];
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    for (const op of operators) {
      const p = (op.driverPrefix ?? '').trim();
      if (!p) continue;

      const key = SerialCounterService.orderSerialKeyForUser(op.id);
      const [counterRow, orderRows] = await Promise.all([
        this.prisma.serialCounter.findUnique({ where: { key } }),
        this.prisma.order.findMany({
          where: { driverId: op.id, serialNumber: { startsWith: `${p}-` } },
          select: { serialNumber: true },
        }),
      ]);
      const re = new RegExp(`^${esc(p)}-(\\d+)$`);
      let maxN = 0;
      const present = new Set<number>();
      for (const r of orderRows) {
        if (!r.serialNumber) continue;
        const m = r.serialNumber.match(re);
        if (m) {
          const n = Number.parseInt(m[1], 10);
          if (Number.isFinite(n)) {
            maxN = Math.max(maxN, n);
            present.add(n);
          }
        }
      }
      const cFromRow = counterRow?.value ?? 0;
      const C = Math.max(cFromRow, maxN);
      if (C <= 0) {
        continue;
      }
      currentCounter += C;

      let slotFilled = 0;
      for (let i = 1; i <= C; i += 1) {
        if (present.has(i)) {
          slotFilled += 1;
        }
      }
      presentCount += slotFilled;

      for (let i = 1; i <= C; i += 1) {
        if (!present.has(i)) {
          gapCount += 1;
          if (firstGaps.length < GAP_SAMPLE_LIMIT) {
            firstGaps.push(`${p}-${i}`);
          }
        }
      }
    }

    return {
      scannedAtIso,
      currentCounter,
      presentCount,
      gapCount,
      firstGaps,
      allGapsTruncated: gapCount > firstGaps.length,
    };
  }

  /**
   * Returns the latest gap scan recorded in AuditLog (either clean or
   * with gaps). `null` = scan has never run on this environment.
   */
  async latestReport(): Promise<{
    report: GapReport;
    hadGaps: boolean;
    recordedAtIso: string;
  } | null> {
    const row = await this.prisma.auditLog.findFirst({
      where: {
        resource: AUDIT_RESOURCE,
        action: { in: [AUDIT_ACTION_GAP, AUDIT_ACTION_CLEAN] },
      },
      orderBy: { createdAt: 'desc' },
      select: { action: true, changes: true, createdAt: true },
    });
    if (!row) return null;
    const payload = row.changes as unknown;
    if (!payload || typeof payload !== 'object') return null;
    const report = payload as GapReport;
    return {
      report,
      hadGaps: row.action === AUDIT_ACTION_GAP,
      recordedAtIso: row.createdAt.toISOString(),
    };
  }

  private async recordScanAudit(report: GapReport): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: report.gapCount > 0 ? AUDIT_ACTION_GAP : AUDIT_ACTION_CLEAN,
        resource: AUDIT_RESOURCE,
        changes: report as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
