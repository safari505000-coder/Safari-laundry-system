import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { KUWAIT_TIMEZONE } from '../common/time/kuwait-time';
import { SerialCounterService } from './serial-counter.service';

/**
 * Serial-gap monitor (Dastur §3.8).
 *
 * The global `ORDER_SERIAL` counter is atomic and bumps only inside the
 * order-creation transaction, so a legitimate gap can only appear if an
 * `Order` row is hard-deleted after the fact — which is exactly the event
 * the Owner needs to see about.
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
  currentCounter: number;
  presentCount: number;
  gapCount: number;
  /** First N missing integers (oldest → newest). Capped to keep payloads sane. */
  firstGaps: number[];
  allGapsTruncated: boolean;
}

const GAP_SAMPLE_LIMIT = 50;
const AUDIT_ACTION_GAP = 'ORDER_SERIAL_GAP_DETECTED';
const AUDIT_ACTION_CLEAN = 'ORDER_SERIAL_GAP_SCAN_CLEAN';
const AUDIT_RESOURCE = '/owner/serials/gaps';

@Injectable()
export class SerialGapService {
  private readonly logger = new Logger(SerialGapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly counter: SerialCounterService,
  ) {}

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
          `[SERIAL-GAP] ${report.gapCount} gap(s) detected; counter=${report.currentCounter}`,
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
    const currentCounter = await this.counter.peek();
    const scannedAtIso = new Date().toISOString();
    if (currentCounter <= 0) {
      return {
        scannedAtIso,
        currentCounter,
        presentCount: 0,
        gapCount: 0,
        firstGaps: [],
        allGapsTruncated: false,
      };
    }

    const rows = await this.prisma.order.findMany({
      where: { serialNumber: { not: null } },
      select: { serialNumber: true },
    });
    const present = new Set<number>();
    for (const r of rows) {
      const n = extractCounter(r.serialNumber);
      if (n !== null && n >= 1 && n <= currentCounter) {
        present.add(n);
      }
    }

    const firstGaps: number[] = [];
    let gapCount = 0;
    for (let i = 1; i <= currentCounter; i++) {
      if (!present.has(i)) {
        gapCount += 1;
        if (firstGaps.length < GAP_SAMPLE_LIMIT) {
          firstGaps.push(i);
        }
      }
    }

    return {
      scannedAtIso,
      currentCounter,
      presentCount: present.size,
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

/**
 * Pulls the trailing integer from a `<prefix>-<n>` serial. Returns
 * `null` for malformed rows rather than crashing the sweep.
 */
function extractCounter(serial: string | null): number | null {
  if (!serial) return null;
  const m = serial.match(/-(\d+)$/);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}
