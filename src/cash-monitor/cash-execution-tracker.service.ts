/**
 * CashExecutionTrackerService — operational tracking + feedback loop.
 *
 * STABILISATION: persistence is now backed by the
 * `CashIntelExecutionEvent` Prisma table. The previous in-memory Maps
 * have been removed — every operator action, every entry into the
 * at-risk set, and every auto-resolve are written as immutable rows.
 *
 *   1. Operator advisory actions (CONTACTED / FOLLOWED_UP / ESCALATED)
 *      → ACTION_LOGGED event, status flips to IN_PROGRESS.
 *   2. The monitor snapshot listener auto-records:
 *        - RISK_ENTERED  when a driver enters the at-risk set,
 *        - AUTO_RESOLVED when a driver leaves the at-risk set while
 *          the latest event for that driver was IN_PROGRESS / OPEN.
 *   3. lateCountLast7Days() reads RISK_ENTERED events within 7d.
 *
 * STRICT: this service NEVER touches financial state. It writes ONLY
 * to `CashIntelExecutionEvent`, an append-only operational ledger.
 *
 * The only in-process state we keep is `lastAtRisk` — a transient
 * Set used to detect set-deltas between snapshots. It is rebuilt on
 * every poll and never read by a public API; restart is harmless.
 */
import {
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  CashIntelExecutionAction as PrismaCashIntelExecutionAction,
  CashIntelExecutionEventType,
  CashIntelExecutionStatus as PrismaCashIntelExecutionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CashMonitorService } from './cash-monitor.service';
import { OperationalLiveDto } from './dto/cash-monitor-operational.dto';
import {
  CashExecutionAction,
  CashExecutionBlockDto,
  CashExecutionStatus,
} from './dto/cash-execution.dto';

const REPEAT_ISSUE_THRESHOLD = 3;

@Injectable()
export class CashExecutionTrackerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CashExecutionTrackerService.name);

  /** Last poll's at-risk driverIds — transient delta tracker. */
  private lastAtRisk = new Set<string>();

  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly monitor: CashMonitorService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Lifecycle ─────────────────────────────────────────────────

  onModuleInit(): void {
    this.unsubscribe = this.monitor.onOperationalSnapshot((op) => {
      // Fire-and-forget: the monitor's poll loop must never block on
      // DB I/O. We catch every error so a failed write cannot wedge
      // the snapshot pipeline.
      this.ingestSnapshot(op).catch((e) =>
        this.logger.warn(
          `execution tracker ingest failed: ${(e as Error).message}`,
        ),
      );
    });
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.lastAtRisk.clear();
  }

  // ─── Public API used by the controller ─────────────────────────

  /**
   * Record an operator action. Returns the freshly composed execution
   * block so the UI can render the new state without a follow-up GET.
   *
   * Branch validation: when `allowedDriverIds` is supplied (MANAGER
   * scope), we throw a 403 if the driver isn't in the manager's
   * current scoped operational view.
   */
  async recordAction(input: {
    driverId: string;
    action: CashExecutionAction;
    note?: string;
    actor: string | null;
    alertType?: string;
    allowedDriverIds?: ReadonlySet<string>;
  }): Promise<CashExecutionBlockDto> {
    if (
      input.allowedDriverIds &&
      !input.allowedDriverIds.has(input.driverId)
    ) {
      throw new ForbiddenException('Driver is not in your branch scope.');
    }

    await this.prisma.cashIntelExecutionEvent.create({
      data: {
        driverId: input.driverId,
        eventType: CashIntelExecutionEventType.ACTION_LOGGED,
        action: input.action as PrismaCashIntelExecutionAction,
        resultStatus: PrismaCashIntelExecutionStatus.IN_PROGRESS,
        alertType: input.alertType ?? null,
        note: input.note ?? null,
        actorUserId: input.actor,
      },
    });

    return this.getExecutionBlock(input.driverId);
  }

  /**
   * Look up the current execution state for a driver. Returns the
   * default OPEN block when there is no recorded action / risk entry
   * yet.
   */
  async getExecutionBlock(driverId: string): Promise<CashExecutionBlockDto> {
    const [statusRow, counts] = await Promise.all([
      this.prisma.cashIntelExecutionEvent.findFirst({
        where: {
          driverId,
          eventType: {
            in: [
              CashIntelExecutionEventType.ACTION_LOGGED,
              CashIntelExecutionEventType.AUTO_RESOLVED,
            ],
          },
        },
        orderBy: { occurredAt: 'desc' },
        select: {
          action: true,
          resultStatus: true,
          actorUserId: true,
          occurredAt: true,
        },
      }),
      this.flagCounts(driverId),
    ]);

    return {
      status:
        (statusRow?.resultStatus as CashExecutionStatus | undefined) ??
        'OPEN',
      lastAction:
        (statusRow?.action as CashExecutionAction | null | undefined) ??
        null,
      lastActionAt: statusRow?.occurredAt?.toISOString() ?? null,
      lastActor: statusRow?.actorUserId ?? null,
      flagsToday: counts.today,
      flagsThisWeek: counts.week,
      repeatIssue: counts.repeatIssue,
    };
  }

  /**
   * Late-count signal feeding the Risk Engine's behaviour multiplier.
   * Counted from RISK_ENTERED events within the last 7 days.
   */
  async lateCountLast7Days(driverId: string): Promise<number> {
    return (await this.flagCounts(driverId)).week;
  }

  /**
   * Bulk variant — used by the Risk Engine to pre-fetch counts for a
   * batch of drivers in a single query instead of one query per row.
   */
  async lateCountsByDriver(
    driverIds: readonly string[],
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (driverIds.length === 0) return out;
    const weekCutoff = new Date(Date.now() - 7 * 86_400_000);
    const grouped = await this.prisma.cashIntelExecutionEvent.groupBy({
      by: ['driverId'],
      where: {
        driverId: { in: [...driverIds] },
        eventType: CashIntelExecutionEventType.RISK_ENTERED,
        occurredAt: { gte: weekCutoff },
      },
      _count: { _all: true },
    });
    for (const row of grouped) {
      out.set(row.driverId, row._count._all);
    }
    return out;
  }

  // ─── Snapshot ingestion ────────────────────────────────────────

  private async ingestSnapshot(op: OperationalLiveDto): Promise<void> {
    const currAtRisk = new Set<string>(
      op.driversAtRisk.map((d) => d.driverId),
    );

    const entries: string[] = [];
    const exits: string[] = [];
    for (const id of currAtRisk) {
      if (!this.lastAtRisk.has(id)) entries.push(id);
    }
    for (const id of this.lastAtRisk) {
      if (!currAtRisk.has(id)) exits.push(id);
    }

    if (entries.length > 0) {
      await this.prisma.cashIntelExecutionEvent.createMany({
        data: entries.map((driverId) => ({
          driverId,
          eventType: CashIntelExecutionEventType.RISK_ENTERED,
          resultStatus: PrismaCashIntelExecutionStatus.OPEN,
        })),
      });
    }

    for (const driverId of exits) {
      const latest = await this.prisma.cashIntelExecutionEvent.findFirst({
        where: {
          driverId,
          eventType: {
            in: [
              CashIntelExecutionEventType.ACTION_LOGGED,
              CashIntelExecutionEventType.AUTO_RESOLVED,
            ],
          },
        },
        orderBy: { occurredAt: 'desc' },
        select: { resultStatus: true },
      });
      if (latest?.resultStatus === PrismaCashIntelExecutionStatus.RESOLVED) {
        continue;
      }
      await this.prisma.cashIntelExecutionEvent.create({
        data: {
          driverId,
          eventType: CashIntelExecutionEventType.AUTO_RESOLVED,
          resultStatus: PrismaCashIntelExecutionStatus.RESOLVED,
        },
      });
    }

    this.lastAtRisk = currAtRisk;
  }

  // ─── Internals ─────────────────────────────────────────────────

  private async flagCounts(driverId: string): Promise<{
    today: number;
    week: number;
    repeatIssue: boolean;
  }> {
    const now = new Date();
    const todayKw = kuwaitDayIso(now);
    const weekCutoff = new Date(now.getTime() - 7 * 86_400_000);
    const events = await this.prisma.cashIntelExecutionEvent.findMany({
      where: {
        driverId,
        eventType: CashIntelExecutionEventType.RISK_ENTERED,
        occurredAt: { gte: weekCutoff },
      },
      select: { occurredAt: true },
    });
    let today = 0;
    for (const e of events) {
      if (kuwaitDayIso(e.occurredAt) === todayKw) today++;
    }
    const week = events.length;
    return { today, week, repeatIssue: week > REPEAT_ISSUE_THRESHOLD };
  }
}

// ─── helpers ─────────────────────────────────────────────────────

function kuwaitDayIso(d: Date): string {
  // Asia/Kuwait is UTC+3 with no DST. We construct the date in that
  // timezone using `Intl.DateTimeFormat`, then return YYYY-MM-DD.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuwait',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(d);
}
