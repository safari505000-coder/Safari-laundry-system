import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Dispatch, DispatchStatus, Prisma, SafariRole } from '@prisma/client';
import { Subject } from 'rxjs';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { DispatchMetricsService } from './dispatch-metrics.service';
import {
  DISPATCH_ACKNOWLEDGED_EVENT,
  DISPATCH_CREATED_EVENT,
  DISPATCH_COMPLETED_EVENT,
  DispatchStreamEventPayload,
  DriverDispatchSseEnvelope,
  ORDER_CREATED_EVENT,
  OrderCreatedEventPayload,
} from './dispatch.events';
import {
  DispatchRowDto,
  DispatchSeverity,
  DispatchSlaTone,
  DispatchSnapshotDto,
} from './dto/dispatch-row.dto';
import { DispatchMonitorSnapshotDto } from './dto/dispatch-monitor.dto';

/**
 * V19.x — Dispatch service. Owns:
 *   - the call-center create-dispatch path (with customer-block guard);
 *   - the read projection (with computed-on-read severity);
 *   - the auto-completion listener (`order.created` → mark COMPLETED).
 *
 * STRICT NON-GOALS:
 *   - No driver-side accept/reject. The dispatch is an instruction.
 *   - No manual completion path. The Invoice (Order row) is the only
 *     truth that can close a dispatch.
 *   - No money fields. Dispatch carries no Decimal columns.
 *   - SLA monitor cron persists first alert / escalation / breach
 *     timestamps on ASSIGNED rows only — never reassigns the driver.
 */
@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  /**
   * In-memory broadcast hub for SSE driver streams. One Subject per
   * driverId. Cleared on process restart by design — the dashboard
   * pulls on connect and SSE only carries deltas. The implementation
   * intentionally avoids a Redis dependency: the brief is single-node
   * realtime, and the worst-case fallback (driver missed the push) is
   * recovered by the dashboard's own pull-on-mount.
   */
  private readonly driverStreams = new Map<
    string,
    Subject<DriverDispatchSseEnvelope>
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly events: EventEmitter2,
    private readonly metrics: DispatchMetricsService,
  ) {}

  /** Kuwait calendar day in UTC instants (Asia/Kuwait is UTC+3 year-round). */
  private kuwaitCalendarDayBoundsUtc(now: Date): {
    dayStart: Date;
    dayEndExclusive: Date;
  } {
    const KUWAIT_OFFSET_MS = 3 * 60 * 60 * 1000;
    const MS_PER_DAY = 86_400_000;
    const shifted = new Date(now.getTime() + KUWAIT_OFFSET_MS);
    const y = shifted.getUTCFullYear();
    const m = shifted.getUTCMonth();
    const d = shifted.getUTCDate();
    const dayStart = new Date(Date.UTC(y, m, d) - KUWAIT_OFFSET_MS);
    const dayEndExclusive = new Date(dayStart.getTime() + MS_PER_DAY);
    return { dayStart, dayEndExclusive };
  }

  /** Roles allowed to create “call center” dispatches (same RBAC lane as MANAGE_DISPATCH). */
  private static readonly CC_CREATOR_ROLES: SafariRole[] = [
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
  ];

  /**
   * Rolling ceiling on how far back the CC dashboard/monitor counts “current”
   * ASSIGNED rows (within the Kuwait calendar day). Stale open assignments
   * from earlier in the shift drop off the board so only relatively fresh CC
   * hand-offs remain visible.
   */
  private static readonly CC_DASHBOARD_MAX_ASSIGNMENT_AGE_MS =
    4 * 60 * 60 * 1000;

  /**
   * Call-center **dashboard** predicate: ASSIGNED, creator is **call-center staff**
   * (`CALL_CENTER` or `CALL_CENTER_SUPERVISOR`), created **today** (Kuwait)
   * **and** no older than {@link DispatchService.CC_DASHBOARD_MAX_ASSIGNMENT_AGE_MS}.
   */
  private ccTrackedDispatchWhere(now: Date = new Date()): Prisma.DispatchWhereInput {
    const { dayStart, dayEndExclusive } = this.kuwaitCalendarDayBoundsUtc(now);
    const recentCutoff = new Date(
      now.getTime() - DispatchService.CC_DASHBOARD_MAX_ASSIGNMENT_AGE_MS,
    );
    const createdFrom =
      recentCutoff.getTime() > dayStart.getTime() ? recentCutoff : dayStart;
    return {
      status: DispatchStatus.ASSIGNED,
      createdAt: {
        gte: createdFrom,
        lt: dayEndExclusive,
      },
      createdBy: {
        is: {
          safariRole: { in: DispatchService.CC_CREATOR_ROLES },
        },
      },
    };
  }

  /**
   * Driver poll/SSE fallback: active instructions from CC lane staff (agent +
   * supervisor), ASSIGNED or IN_PROGRESS — **no** “today only” cut (ops must
   * not lose overnight assignments when acknowledging).
   */
  private driverQueueDispatchWhere(): Prisma.DispatchWhereInput {
    return {
      status: {
        in: [DispatchStatus.ASSIGNED, DispatchStatus.IN_PROGRESS],
      },
      createdBy: {
        is: {
          safariRole: { in: DispatchService.CC_CREATOR_ROLES },
        },
      },
    };
  }

  private isCallCenterCreatorRole(actorRole: string | null): boolean {
    if (!actorRole) return false;
    return (DispatchService.CC_CREATOR_ROLES as readonly string[]).includes(
      actorRole,
    );
  }

  /**
   * Hard failsafe before returning dispatch lists: valid IDs, allowed status,
   * dedupe. CC dashboard rows must be ASSIGNED-only; driver queue keeps IN_PROGRESS.
   */
  private finalizeCcDispatchRows<
    T extends {
      id: string;
      driverId: string;
      customerId: string;
      status: DispatchStatus;
    },
  >(
    context: string,
    raw: T[],
    policy: 'cc_dashboard_strict' | 'driver_queue',
  ): T[] {
    const before = raw.length;
    const allowed =
      policy === 'cc_dashboard_strict'
        ? new Set<DispatchStatus>([DispatchStatus.ASSIGNED])
        : new Set<DispatchStatus>([
            DispatchStatus.ASSIGNED,
            DispatchStatus.IN_PROGRESS,
          ]);
    const seen = new Set<string>();
    const out: T[] = [];
    for (const r of raw) {
      if (!r.driverId?.trim() || !r.customerId?.trim()) continue;
      if (!allowed.has(r.status)) continue;
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // CALL-CENTER WRITE PATH
  // ---------------------------------------------------------------------------

  /**
   * Create a new dispatch instruction. Authoritative checks:
   *   1. Customer must exist AND not be blocked. Blocked customers get
   *      a 403 with a CUSTOMER_BLOCKED code so the UI can branch on it.
   *   2. Driver must exist AND have role DRIVER. We do NOT allow
   *      assigning instructions to non-drivers (managers, supervisors,
   *      etc.) — that would muddy the operational model.
   *   3. The DB write itself is a single `prisma.dispatch.create`
   *      (atomic) followed by an audit row + an SSE/event broadcast.
   *      Audit failure is logged but does NOT roll back the dispatch
   *      (matches the rest of the codebase's audit pattern — see
   *      `AuditLogsService.log`).
   */
  async create(input: {
    customerId: string;
    driverId: string;
    instructionNote: string | null;
    actorUserId: string | null;
    actorRole: string | null;
  }): Promise<DispatchRowDto> {
    const [customer, driver] = await Promise.all([
      this.prisma.customer.findUnique({
        where: { id: input.customerId },
        select: {
          id: true,
          isBlocked: true,
          blockReason: true,
          displayName: true,
          phone: true,
        },
      }),
      this.prisma.user.findUnique({
        where: { id: input.driverId },
        select: {
          id: true,
          fullName: true,
          username: true,
          isActive: true,
          safariRole: true,
        },
      }),
    ]);

    if (!customer) {
      throw new NotFoundException({
        code: 'CUSTOMER_NOT_FOUND',
        customerId: input.customerId,
      });
    }
    if (customer.isBlocked) {
      throw new ForbiddenException({
        code: 'CUSTOMER_BLOCKED',
        customerId: customer.id,
        blockReason: customer.blockReason,
      });
    }

    if (!driver || !driver.isActive) {
      throw new NotFoundException({
        code: 'DRIVER_NOT_FOUND',
        driverId: input.driverId,
      });
    }
    if (driver.safariRole !== SafariRole.DRIVER) {
      throw new BadRequestException({
        code: 'DRIVER_ROLE_MISMATCH',
        driverId: driver.id,
        actualRole: driver.safariRole,
      });
    }
    if (!driver.id?.trim()) {
      throw new BadRequestException({
        code: 'INVALID_DRIVER_ASSIGNMENT',
        message: 'Invalid driverId assignment',
      });
    }

    const duplicate = await this.prisma.dispatch.findFirst({
      where: {
        customerId: customer.id,
        driverId: driver.id,
        status: DispatchStatus.ASSIGNED,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (duplicate) {
      this.logger.warn(
        `dispatch_duplicate_create_prevented customerId=${customer.id} driverId=${driver.id} dispatchId=${duplicate.id}`,
      );
      return this.toRowDto(
        duplicate,
        {
          customerDisplay: customer.displayName?.trim() || customer.phone,
          customerPhone: customer.phone,
          driverName: driver.fullName?.trim() || driver.username,
        },
        new Date(),
      );
    }

    const isCallCenterDispatch = this.isCallCenterCreatorRole(input.actorRole);
    const createdByUserId =
      isCallCenterDispatch && input.actorUserId ? input.actorUserId : null;

    const dispatch = await this.prisma.dispatch.create({
      data: {
        customerId: input.customerId,
        driverId: driver.id,
        instructionNote: input.instructionNote?.trim() || null,
        createdByUserId,
        // status + createdAt take their defaults (ASSIGNED + now()).
      },
    });

    this.auditLogs.log({
      action: 'DISPATCH_CREATED',
      resource: 'dispatch',
      status: 'SUCCESS',
      userId: input.actorUserId,
      role: input.actorRole,
      customerId: input.customerId,
      changes: {
        dispatchId: dispatch.id,
        driverId: driver.id,
        instructionNote: dispatch.instructionNote,
      },
    });

    const driverDisplay = driver.fullName?.trim() || driver.username;
    const customerDisplay = customer.displayName?.trim() || customer.phone;

    const row = this.toRowDto(
      dispatch,
      {
        customerDisplay,
        customerPhone: customer.phone,
        driverName: driverDisplay,
      },
      new Date(),
    );

    try {
      await this.metrics.incrementAssigned(driver.id, dispatch.createdAt);
    } catch (error: unknown) {
      this.logger.warn(
        `dispatch_metrics_assigned_increment_failed driverId=${driver.id} reason=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // Broadcast to the driver's SSE channel (ignored if nobody is
    // listening yet — they will pick the new row up on next dashboard
    // pull anyway).
    this.broadcastDriverEnvelope(driver.id, {
      event: 'dispatch:new',
      row,
    });
    // App-level event so the call-center dashboard websocket / future
    // listeners can pick it up.
    this.events.emit(DISPATCH_CREATED_EVENT, row);

    return row;
  }

  // ---------------------------------------------------------------------------
  // AUTO-COMPLETION LISTENER (Part 4 — Invoice = ONLY completion trigger)
  // ---------------------------------------------------------------------------

  /**
   * Listen for `order.created` and, if the order points at a dispatch
   * that is still ASSIGNED, mark it COMPLETED. Idempotent guarantees:
   *   - Uses `updateMany` with `status: ASSIGNED` predicate so the
   *     same event fired twice (dev hot-reload, retry, etc.) only
   *     stamps `completedAt` ONCE.
   *   - The `completedByOrderId` UNIQUE constraint at the DB level
   *     enforces that one order can only ever close one dispatch.
   *
   * This listener is the SINGLE place dispatch completion happens —
   * the controller intentionally exposes no `markCompleted` route.
   */
  @OnEvent(ORDER_CREATED_EVENT, { async: true })
  async handleOrderCreated(payload: OrderCreatedEventPayload): Promise<void> {
    if (!payload?.dispatchId) return;
    try {
      const closedAt = (() => {
        const parsed = new Date(payload.occurredAtIso);
        return Number.isFinite(parsed.getTime()) ? parsed : new Date();
      })();

      const before = await this.prisma.dispatch.findUnique({
        where: { id: payload.dispatchId },
        select: {
          id: true,
          createdAt: true,
          driverId: true,
          customerId: true,
        },
      });
      if (!before) return;

      const totalMinutes = computeElapsedMinutes(before.createdAt, closedAt);

      const result = await this.prisma.dispatch.updateMany({
        where: {
          id: payload.dispatchId,
          status: { in: [DispatchStatus.ASSIGNED, DispatchStatus.IN_PROGRESS] },
        },
        data: {
          status: DispatchStatus.COMPLETED,
          completedAt: closedAt,
          completedByOrderId: payload.orderId,
          totalMinutes,
        },
      });
      if (result.count === 0) {
        // Dispatch already closed (or never existed). Either is fine
        // — duplicate event is a no-op.
        return;
      }

      try {
        await this.metrics.recordCompletion({
          driverId: before.driverId,
          at: closedAt,
          totalMinutes,
        });
      } catch (error: unknown) {
        this.logger.warn(
          `dispatch_metrics_completion_failed dispatchId=${payload.dispatchId} reason=${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      const closed = await this.prisma.dispatch.findUnique({
        where: { id: payload.dispatchId },
        include: {
          customer: { select: { displayName: true, phone: true } },
          driver: { select: { fullName: true, username: true } },
        },
      });
      if (!closed) return;

      this.auditLogs.log({
        action: 'DISPATCH_COMPLETED',
        resource: 'dispatch',
        status: 'SUCCESS',
        userId: payload.actorUserId,
        customerId: closed.customerId,
        orderId: payload.orderId,
        changes: {
          dispatchId: closed.id,
          driverId: closed.driverId,
          completedAt: closed.completedAt?.toISOString() ?? null,
          completedByOrderId: closed.completedByOrderId,
          totalMinutes,
        },
      });

      const now = new Date();
      const row = this.toRowDto(
        closed,
        {
          customerDisplay:
            closed.customer.displayName?.trim() || closed.customer.phone,
          customerPhone: closed.customer.phone,
          driverName:
            closed.driver.fullName?.trim() || closed.driver.username,
        },
        now,
      );
      this.broadcastDriverEnvelope(closed.driverId, {
        event: 'dispatch:update',
        row,
      });
      this.events.emit(DISPATCH_COMPLETED_EVENT, this.rowToStreamPayload(row));
    } catch (error: unknown) {
      // Never let a dispatch-side bug roll back the order itself. Log
      // loudly and move on — the audit row is the recovery path.
      this.logger.error(
        `dispatch_auto_complete_failed orderId=${payload.orderId} dispatchId=${
          payload.dispatchId ?? 'null'
        } reason=${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // READ PROJECTIONS
  // ---------------------------------------------------------------------------

  /**
   * Call-center dashboard board: ASSIGNED only, creator **CALL_CENTER** or
   * **CALL_CENTER_SUPERVISOR**, created **today** (Kuwait) **and** within the
   * rolling freshness window (see `CC_DASHBOARD_MAX_ASSIGNMENT_AGE_MS`).
   */
  async listActive(
    input: {
      limit?: number;
    } = {},
  ): Promise<DispatchSnapshotDto> {
    const limit = clampPositive(input.limit, 200, 50);
    const now = new Date();
    const rows = await this.prisma.dispatch.findMany({
      where: this.ccTrackedDispatchWhere(now),
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: {
        customer: { select: { displayName: true, phone: true } },
        driver: { select: { fullName: true, username: true } },
      },
    });
    const cleaned = this.finalizeCcDispatchRows(
      'listActive',
      rows,
      'cc_dashboard_strict',
    );
    return {
      generatedAtIso: now.toISOString(),
      rows: cleaned.map((r) =>
        this.toRowDto(
          r,
          {
            customerDisplay: r.customer.displayName?.trim() || r.customer.phone,
            customerPhone: r.customer.phone,
            driverName: r.driver.fullName?.trim() || r.driver.username,
          },
          now,
        ),
      ),
    };
  }

  /**
   * Driver queue: ASSIGNED + IN_PROGRESS from CC lane creators (agent +
   * supervisor). Intentionally **not** “today only” so existing assignments are
   * still actionable after midnight Kuwait time.
   */
  async listForDriver(driverId: string): Promise<DispatchSnapshotDto> {
    const rows = await this.prisma.dispatch.findMany({
      where: {
        driverId,
        ...this.driverQueueDispatchWhere(),
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        customer: { select: { displayName: true, phone: true } },
        driver: { select: { fullName: true, username: true } },
      },
    });
    const deduped = this.finalizeCcDispatchRows(
      'listForDriver',
      rows,
      'driver_queue',
    );
    this.logger.debug(
      `driver_dispatch_poll driverId=${driverId} count=${deduped.length}`,
    );
    const now = new Date();
    return {
      generatedAtIso: now.toISOString(),
      rows: deduped.map((r) =>
        this.toRowDto(
          r,
          {
            customerDisplay: r.customer.displayName?.trim() || r.customer.phone,
            customerPhone: r.customer.phone,
            driverName: r.driver.fullName?.trim() || r.driver.username,
          },
          now,
        ),
      ),
    };
  }

  async acknowledge(input: {
    dispatchId: string;
    driverId: string;
  }): Promise<DispatchRowDto> {
    const now = new Date();

    const presentationSelect = {
      customer: { select: { displayName: true, phone: true } },
      driver: { select: { fullName: true, username: true } },
    } as const;

    const existing = await this.prisma.dispatch.findUnique({
      where: { id: input.dispatchId },
      include: presentationSelect,
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'DISPATCH_NOT_FOUND',
        dispatchId: input.dispatchId,
      });
    }

    if (existing.driverId !== input.driverId) {
      throw new ForbiddenException({
        code: 'DISPATCH_DRIVER_MISMATCH',
        dispatchId: input.dispatchId,
      });
    }

    if (existing.status !== DispatchStatus.ASSIGNED) {
      return this.toRowDto(
        existing,
        {
          customerDisplay:
            existing.customer.displayName?.trim() || existing.customer.phone,
          customerPhone: existing.customer.phone,
          driverName:
            existing.driver.fullName?.trim() || existing.driver.username,
        },
        now,
      );
    }

    const ackMinutes = computeElapsedMinutes(existing.createdAt, now);

    const result = await this.prisma.dispatch.updateMany({
      where: {
        id: input.dispatchId,
        driverId: input.driverId,
        status: DispatchStatus.ASSIGNED,
      },
      data: {
        status: DispatchStatus.IN_PROGRESS,
        acknowledgedAt: now,
        startedAt: now,
        ackMinutes,
      },
    });

    const latest = await this.prisma.dispatch.findUnique({
      where: { id: input.dispatchId },
      include: presentationSelect,
    });

    if (!latest) {
      throw new NotFoundException({
        code: 'DISPATCH_NOT_FOUND',
        dispatchId: input.dispatchId,
      });
    }

    if (result.count === 0) {
      return this.toRowDto(
        latest,
        {
          customerDisplay:
            latest.customer.displayName?.trim() || latest.customer.phone,
          customerPhone: latest.customer.phone,
          driverName:
            latest.driver.fullName?.trim() || latest.driver.username,
        },
        now,
      );
    }

    try {
      await this.metrics.recordAcknowledged(
        latest.driverId,
        now,
        ackMinutes,
      );
    } catch (error: unknown) {
      this.logger.warn(
        `dispatch_metrics_ack_failed dispatchId=${latest.id} reason=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    this.auditLogs.log({
      action: 'DISPATCH_ACKNOWLEDGED',
      resource: 'dispatch',
      status: 'SUCCESS',
      userId: input.driverId,
      customerId: latest.customerId,
      changes: {
        dispatchId: latest.id,
        driverId: latest.driverId,
        acknowledgedAt: latest.acknowledgedAt?.toISOString() ?? null,
        ackMinutes,
      },
    });

    const row = this.toRowDto(
      latest,
      {
        customerDisplay:
          latest.customer.displayName?.trim() || latest.customer.phone,
        customerPhone: latest.customer.phone,
        driverName:
          latest.driver.fullName?.trim() || latest.driver.username,
      },
      now,
    );
    this.broadcastDriverEnvelope(latest.driverId, {
      event: 'dispatch:update',
      row,
    });
    this.events.emit(
      DISPATCH_ACKNOWLEDGED_EVENT,
      this.rowToStreamPayload(row),
    );

    return row;
  }

  // ---------------------------------------------------------------------------
  // SLA MONITOR (cron — no driver reassignment)
  // ---------------------------------------------------------------------------

  /**
   * V19.x — Public roster of drivers eligible to receive a dispatch.
   *
   * Filter rules (kept deliberately tight so the call-center picker
   * never offers an unusable assignee):
   *   - `safariRole = DRIVER` only (managers, supervisors, etc. are
   *     never valid dispatch targets — see `create()` validation).
   *   - `isActive = true` (Owner-disabled accounts cannot sign in,
   *     so dispatching to them would silently rot in their queue).
   *
   * Output is intentionally minimal: id, name, isActive. We do NOT
   * include phone, employeeId, branch, custody balances, or any
   * financial column — the dispatch picker needs a label and a
   * sortable identifier, nothing more. Adding more fields here would
   * leak data the CALL_CENTER role is not supposed to see (per the
   * RBAC matrix, CC has VIEW_DISPATCH but not VIEW_PAYROLL or
   * staff-directory access on `/api/users`).
   *
   * Sort: ascending by **dashboard-visible** ASSIGNED load (CC lane creations,
   * Kuwait calendar day, rolling ~4h freshness window), ties broken by name on the server so
   * every picker sees the same order.
   */
  async listAvailableDrivers(): Promise<
    Array<{ id: string; name: string; isActive: boolean; activeLoad: number }>
  > {
    const drivers = await this.prisma.user.findMany({
      where: {
        safariRole: SafariRole.DRIVER,
        isActive: true,
      },
      select: {
        id: true,
        fullName: true,
        username: true,
        isActive: true,
      },
      orderBy: { fullName: 'asc' },
    });
    if (drivers.length === 0) return [];

    const clock = new Date();
    const loads = await this.prisma.dispatch.groupBy({
      by: ['driverId'],
      where: {
        ...this.ccTrackedDispatchWhere(clock),
        driverId: { in: drivers.map((d) => d.id) },
      },
      _count: { _all: true },
    });
    const loadById = new Map<string, number>(
      loads.map((row) => [row.driverId, row._count._all]),
    );

    return drivers
      .map((d) => ({
        id: d.id,
        // Fall back to username when fullName is empty so the picker
        // never renders an unlabelled option.
        name: d.fullName?.trim() || d.username,
        isActive: d.isActive,
        activeLoad: loadById.get(d.id) ?? 0,
      }))
      .sort((a, b) => {
        const loadDelta = a.activeLoad - b.activeLoad;
        if (loadDelta !== 0) return loadDelta;
        return a.name.localeCompare(b.name);
      });
  }

  /**
   * SLA monitor — ASSIGNED rows only. Minutes since `createdAt`:
   * ≥2 → `firstAlertAt` + driver SSE `dispatch:alert`;
   * ≥5 → `escalatedAt` + audit / internal notify hooks;
   * ≥10 → `breachedAt` + audit / manager hooks.
   *
   * Idempotent: each tier writes once (NULL-check in the patch).
   *
   * Only considers ASSIGNED rows that match the strict CC dashboard predicate
   * (CALL_CENTER lane creator, Kuwait calendar day, rolling freshness window).
   */
  async runSlaMonitorOnce(input: {
    limit?: number;
  }): Promise<{
    inspected: number;
    firstAlerts: number;
    escalations: number;
    breaches: number;
  }> {
    const limit = input.limit ?? 200;
    const now = new Date();

    const rowsRaw = await this.prisma.dispatch.findMany({
      where: this.ccTrackedDispatchWhere(now),
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: {
        customer: { select: { displayName: true, phone: true } },
        driver: { select: { fullName: true, username: true } },
      },
    });
    const rows = this.finalizeCcDispatchRows(
      'runSlaMonitorOnce',
      rowsRaw,
      'cc_dashboard_strict',
    );

    let firstAlerts = 0;
    let escalations = 0;
    let breaches = 0;

    for (const row of rows) {
      const ageMin = computeElapsedMinutes(row.createdAt, now);
      const needsPatch =
        (ageMin >= 2 && !row.firstAlertAt) ||
        (ageMin >= 5 && !row.escalatedAt) ||
        (ageMin >= 10 && !row.breachedAt);
      if (!needsPatch) continue;

      const hadFirst = !!row.firstAlertAt;
      const hadEsc = !!row.escalatedAt;
      const hadBr = !!row.breachedAt;

      try {
        await this.prisma.$transaction(async (tx) => {
          const cur = await tx.dispatch.findUnique({
            where: { id: row.id },
            select: {
              id: true,
              status: true,
              firstAlertAt: true,
              escalatedAt: true,
              breachedAt: true,
            },
          });
          if (!cur || cur.status !== DispatchStatus.ASSIGNED) return;

          const patch: Prisma.DispatchUpdateInput = {};
          if (ageMin >= 2 && !cur.firstAlertAt) patch.firstAlertAt = now;
          if (ageMin >= 5 && !cur.escalatedAt) patch.escalatedAt = now;
          if (ageMin >= 10 && !cur.breachedAt) patch.breachedAt = now;
          if (Object.keys(patch).length === 0) return;

          await tx.dispatch.update({
            where: { id: cur.id },
            data: patch,
          });
        });
      } catch (error: unknown) {
        this.logger.warn(
          `dispatch_sla_monitor_row_failed dispatchId=${row.id} reason=${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        continue;
      }

      const fresh = await this.prisma.dispatch.findUnique({
        where: { id: row.id },
        include: {
          customer: { select: { displayName: true, phone: true } },
          driver: { select: { fullName: true, username: true } },
        },
      });
      if (!fresh || fresh.status !== DispatchStatus.ASSIGNED) continue;

      const alertNew = !hadFirst && !!fresh.firstAlertAt;
      const escNew = !hadEsc && !!fresh.escalatedAt;
      const brNew = !hadBr && !!fresh.breachedAt;

      if (!alertNew && !escNew && !brNew) continue;

      if (alertNew) firstAlerts += 1;
      if (escNew) escalations += 1;
      if (brNew) breaches += 1;

      const pres = {
        customerDisplay:
          fresh.customer.displayName?.trim() || fresh.customer.phone,
        customerPhone: fresh.customer.phone,
        driverName: fresh.driver.fullName?.trim() || fresh.driver.username,
      };
      const dto = this.toRowDto(fresh, pres, now);

      this.broadcastDriverEnvelope(fresh.driverId, {
        event: 'dispatch:alert',
        row: dto,
      });

      if (escNew) {
        this.events.emit('dispatch.sla.escalated', {
          dispatchId: fresh.id,
          driverId: fresh.driverId,
          customerId: fresh.customerId,
          escalatedAtIso: fresh.escalatedAt?.toISOString() ?? null,
        });
        void this.auditLogs.log({
          action: 'DISPATCH_SLA_ESCALATED',
          resource: 'dispatch',
          status: 'SUCCESS',
          userId: null,
          role: 'SYSTEM',
          customerId: fresh.customerId,
          source: 'SLA_MONITOR_CRON',
          changes: {
            dispatchId: fresh.id,
            driverId: fresh.driverId,
            escalatedAt: fresh.escalatedAt?.toISOString() ?? null,
          },
        });
      }

      if (brNew) {
        this.events.emit('dispatch.sla.breach', {
          dispatchId: fresh.id,
          driverId: fresh.driverId,
          customerId: fresh.customerId,
          breachedAtIso: fresh.breachedAt?.toISOString() ?? null,
        });
        void this.auditLogs.log({
          action: 'DISPATCH_SLA_BREACH',
          resource: 'dispatch',
          status: 'SUCCESS',
          userId: null,
          role: 'SYSTEM',
          customerId: fresh.customerId,
          source: 'SLA_MONITOR_CRON',
          changes: {
            dispatchId: fresh.id,
            driverId: fresh.driverId,
            breachedAt: fresh.breachedAt?.toISOString() ?? null,
          },
        });
      }
    }

    return {
      inspected: rows.length,
      firstAlerts,
      escalations,
      breaches,
    };
  }

  async monitorForCallCenter(): Promise<DispatchMonitorSnapshotDto> {
    const now = new Date();
    const rows = await this.prisma.dispatch.findMany({
      where: this.ccTrackedDispatchWhere(now),
      orderBy: { createdAt: 'asc' },
      take: 500,
      include: {
        customer: { select: { displayName: true, phone: true } },
        driver: { select: { id: true, fullName: true, username: true } },
      },
    });

    const cleanedRows = this.finalizeCcDispatchRows(
      'monitorForCallCenter',
      rows,
      'cc_dashboard_strict',
    );
    const driverNameById = new Map<string, string>();
    const delayedByDispatchId = new Map<string, DispatchRowDto>();

    const allTasks = cleanedRows.map((r) => {
      const pres = {
        customerDisplay: r.customer.displayName?.trim() || r.customer.phone,
        customerPhone: r.customer.phone,
        driverName: r.driver.fullName?.trim() || r.driver.username,
      };
      driverNameById.set(r.driverId, pres.driverName);
      const dto = this.toRowDto(r, pres, now);

      // “Delayed” strip: escalation tier (≥5 min SLA) or breach — not every row
      // that merely passed the 2‑minute first-alert threshold (that matched
      // almost all assignments and looked like junk data).
      const showInDelayedSection =
        dto.slaTone === 'BREACH' ||
        (dto.slaTone === 'LATE' && dto.elapsedMinutes >= 5);
      if (showInDelayedSection) {
        delayedByDispatchId.set(dto.id, dto);
      }
      return dto;
    });
    const drivers = [...driverNameById.entries()].map(([driverId, driverName]) => {
      const assignedTasks = allTasks.filter((t) => t.driverId === driverId);
      return {
        driverId,
        driverName,
        activeAssignedCount: assignedTasks.length,
        lateCount: assignedTasks.filter((t) => t.slaTone === 'LATE').length,
        breachCount: assignedTasks.filter((t) => t.slaTone === 'BREACH').length,
        assignedTasks,
      };
    });

    return {
      generatedAtIso: now.toISOString(),
      drivers,
      delayedDriversSection: [...delayedByDispatchId.values()],
    };
  }

  /**
   * Manual reassignment is disabled: each customer/driver assignment is fixed
   * for the lifetime of the dispatch; escalation is visibility-only (SLA stamps).
   */
  async reassign(_input: {
    dispatchId: string;
    newDriverId: string;
    reason: string | null;
    actorUserId: string | null;
    actorRole: string | null;
  }): Promise<Dispatch> {
    throw new ForbiddenException({
      code: 'DISPATCH_REASSIGN_FORBIDDEN',
      message:
        'إعادة إسناد المهمة غير مسموحة — المهمة تبقى عند نفس السائق حتى إغلاق الفاتورة.',
    });
  }

  // ---------------------------------------------------------------------------
  // RECONCILIATION (Part 2 — event-loss safety net)
  // ---------------------------------------------------------------------------

  /**
   * Find ASSIGNED dispatches that already have an Order pointing at
   * them. Such rows SHOULD have been closed by `handleOrderCreated`
   * — when they aren't (event listener died, EventEmitter restart,
   * pre-V19.x rows from before the listener existed) the
   * reconciliation cron mops them up.
   */
  async findReconciliationCandidates(
    limit = 100,
  ): Promise<Array<{ id: string; customerId: string; orderId: string }>> {
    const rows = await this.prisma.dispatch.findMany({
      where: {
        status: { in: [DispatchStatus.ASSIGNED, DispatchStatus.IN_PROGRESS] },
        orders: { some: {} },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true,
        customerId: true,
        orders: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { id: true },
        },
      },
    });
    return rows
      .map((d) => ({
        id: d.id,
        customerId: d.customerId,
        orderId: d.orders[0]?.id ?? '',
      }))
      .filter((r) => r.orderId);
  }

  /**
   * Close ONE stuck dispatch idempotently. Same `WHERE status:
   * ASSIGNED` predicate as the EventEmitter listener so the two
   * paths cannot double-stamp the row. Audit row written only when
   * the update actually flipped the status.
   */
  async reconcileOne(input: {
    dispatchId: string;
    orderId: string;
    customerId: string;
  }): Promise<{ closed: boolean }> {
    const snapshot = await this.prisma.dispatch.findUnique({
      where: { id: input.dispatchId },
      select: { createdAt: true, driverId: true },
    });
    if (!snapshot) {
      return { closed: false };
    }

    const completedAt = new Date();
    const totalMinutes = computeElapsedMinutes(snapshot.createdAt, completedAt);

    const result = await this.prisma.dispatch.updateMany({
      where: {
        id: input.dispatchId,
        status: { in: [DispatchStatus.ASSIGNED, DispatchStatus.IN_PROGRESS] },
      },
      data: {
        status: DispatchStatus.COMPLETED,
        completedAt,
        completedByOrderId: input.orderId,
        totalMinutes,
      },
    });
    if (result.count === 0) {
      return { closed: false };
    }

    try {
      await this.metrics.recordCompletion({
        driverId: snapshot.driverId,
        at: completedAt,
        totalMinutes,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `dispatch_metrics_reconcile_completion_failed dispatchId=${input.dispatchId} reason=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const closedRow = await this.prisma.dispatch.findUnique({
      where: { id: input.dispatchId },
      include: {
        customer: { select: { displayName: true, phone: true } },
        driver: { select: { fullName: true, username: true } },
      },
    });
    if (closedRow) {
      const now = new Date();
      const row = this.toRowDto(
        closedRow,
        {
          customerDisplay:
            closedRow.customer.displayName?.trim() || closedRow.customer.phone,
          customerPhone: closedRow.customer.phone,
          driverName:
            closedRow.driver.fullName?.trim() || closedRow.driver.username,
        },
        now,
      );
      this.broadcastDriverEnvelope(closedRow.driverId, {
        event: 'dispatch:update',
        row,
      });
      this.events.emit(DISPATCH_COMPLETED_EVENT, this.rowToStreamPayload(row));
    }

    this.auditLogs.log({
      action: 'DISPATCH_RECONCILED',
      resource: 'dispatch',
      status: 'SUCCESS',
      userId: null,
      role: 'SYSTEM',
      customerId: input.customerId,
      orderId: input.orderId,
      source: 'RECONCILIATION_CRON',
      changes: {
        dispatchId: input.dispatchId,
        completedByOrderId: input.orderId,
        totalMinutes,
      },
    });
    return { closed: true };
  }

  /**
   * RECONCILIATION (cron). Wraps candidate fetch + per-row close +
   * audit. Idempotent: the second tick finds zero candidates because
   * the first already flipped them to COMPLETED.
   */
  async runReconciliationOnce(input: { limit?: number } = {}): Promise<{
    inspected: number;
    closed: number;
  }> {
    const candidates = await this.findReconciliationCandidates(input.limit);
    let closed = 0;
    for (const c of candidates) {
      const result = await this.reconcileOne({
        dispatchId: c.id,
        orderId: c.orderId,
        customerId: c.customerId,
      });
      if (result.closed) closed += 1;
    }
    return { inspected: candidates.length, closed };
  }

  // ---------------------------------------------------------------------------
  // SSE STREAM HELPERS
  // ---------------------------------------------------------------------------

  /** Subscribe a driver's SSE controller to push events. */
  subscribeDriverStream(driverId: string): Subject<DriverDispatchSseEnvelope> {
    const existing = this.driverStreams.get(driverId);
    if (existing) return existing;
    const subject = new Subject<DriverDispatchSseEnvelope>();
    this.driverStreams.set(driverId, subject);
    return subject;
  }

  /** Tear down the driver's SSE channel when nobody is listening. */
  unsubscribeDriverStream(
    driverId: string,
    subject: Subject<DriverDispatchSseEnvelope>,
  ): void {
    const current = this.driverStreams.get(driverId);
    if (current && current === subject) {
      this.driverStreams.delete(driverId);
    }
  }

  private broadcastDriverEnvelope(
    driverId: string,
    envelope: DriverDispatchSseEnvelope,
  ): void {
    const subject = this.driverStreams.get(driverId);
    if (!subject) return;
    try {
      subject.next(envelope);
    } catch (error: unknown) {
      this.logger.warn(
        `dispatch_sse_broadcast_failed driverId=${driverId} reason=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private rowToStreamPayload(row: DispatchRowDto): DispatchStreamEventPayload {
    return {
      dispatchId: row.id,
      driverId: row.driverId,
      customerId: row.customerId,
      status: row.status,
      createdAtIso: row.createdAtIso,
      acknowledgedAtIso: row.acknowledgedAtIso,
      completedAtIso: row.completedAtIso,
    };
  }

  // ---------------------------------------------------------------------------
  // ROW MAPPER (single source of truth for severity/elapsed math)
  // ---------------------------------------------------------------------------

  private toRowDto(
    d: Dispatch,
    presentation: {
      customerDisplay: string;
      customerPhone: string;
      driverName: string;
    },
    now: Date,
  ): DispatchRowDto {
    const elapsedMinutes = computeElapsedMinutes(
      d.createdAt,
      d.status === DispatchStatus.COMPLETED ? (d.completedAt ?? now) : now,
    );
    const severity = severityFor(d.status, elapsedMinutes);
    const slaTone = slaToneDispatch(d, elapsedMinutes);
    return {
      id: d.id,
      status: d.status,
      severity,
      elapsedMinutes,
      customerId: d.customerId,
      customerDisplay: presentation.customerDisplay,
      customerPhone: presentation.customerPhone,
      driverId: d.driverId,
      driverName: presentation.driverName,
      instructionNote: d.instructionNote,
      createdAtIso: d.createdAt.toISOString(),
      acknowledgedAtIso: d.acknowledgedAt?.toISOString() ?? null,
      completedAtIso: d.completedAt?.toISOString() ?? null,
      completedByOrderId: d.completedByOrderId,
      startedAtIso: d.startedAt?.toISOString() ?? null,
      firstAlertAtIso: d.firstAlertAt?.toISOString() ?? null,
      escalatedAtIso: d.escalatedAt?.toISOString() ?? null,
      breachedAtIso: d.breachedAt?.toISOString() ?? null,
      ackMinutes: d.ackMinutes ?? null,
      totalMinutes: d.totalMinutes ?? null,
      slaTone,
    };
  }
}

// -----------------------------------------------------------------------------
// PURE HELPERS (exported for unit tests)
// -----------------------------------------------------------------------------

/**
 * Whole-minute integer elapsed between two Date instances. Negative
 * values are clamped to 0 so a slightly-skewed clock never ships a
 * minus sign to the UI.
 */
export function computeElapsedMinutes(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / 60_000);
}

/**
 * Single source of truth for dispatch severity. Thresholds live here
 * and ONLY here so the API and tests cannot drift apart.
 */
export function severityFor(
  status: DispatchStatus,
  elapsedMinutes: number,
): DispatchSeverity {
  if (status === DispatchStatus.COMPLETED) return 'COMPLETED';
  if (elapsedMinutes >= 20) return 'CRITICAL';
  if (elapsedMinutes >= 10) return 'LATE';
  return 'ON_TIME';
}

/**
 * Assignment SLA traffic-light (persisted stamps + live age fallback).
 */
export function slaToneDispatch(
  d: Dispatch,
  elapsedMinutesSinceCreated: number,
): DispatchSlaTone {
  if (d.status === DispatchStatus.COMPLETED) return 'NORMAL';
  if (d.status === DispatchStatus.IN_PROGRESS) return 'NORMAL';
  if (d.breachedAt || elapsedMinutesSinceCreated >= 10) return 'BREACH';
  if (d.escalatedAt || elapsedMinutesSinceCreated >= 5) return 'LATE';
  if (d.firstAlertAt || elapsedMinutesSinceCreated >= 2) return 'LATE';
  return 'NORMAL';
}

function clampPositive(
  value: number | undefined,
  max: number,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(value), max);
}

// Re-export the Dispatch row type so consumers can import it from
// this module rather than reaching into @prisma/client directly. The
// service file is the conceptual home of dispatch-shaped data.
export type { Dispatch };
