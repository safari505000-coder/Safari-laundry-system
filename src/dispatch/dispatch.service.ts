import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Dispatch, DispatchStatus, SafariRole } from '@prisma/client';
import { Subject } from 'rxjs';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DISPATCH_CREATED_EVENT,
  DISPATCH_COMPLETED_EVENT,
  DispatchStreamEventPayload,
  ORDER_CREATED_EVENT,
  OrderCreatedEventPayload,
} from './dispatch.events';
import {
  DispatchRowDto,
  DispatchSeverity,
  DispatchSnapshotDto,
} from './dto/dispatch-row.dto';

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
 *   - No background cron. The LATE / CRITICAL severities are always
 *     derived live so the UI matches the wall clock to the second.
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
    Subject<DispatchStreamEventPayload>
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly events: EventEmitter2,
  ) {}

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

    const dispatch = await this.prisma.dispatch.create({
      data: {
        customerId: input.customerId,
        driverId: input.driverId,
        instructionNote: input.instructionNote?.trim() || null,
        createdByUserId: input.actorUserId,
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
        driverId: input.driverId,
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

    // Broadcast to the driver's SSE channel (ignored if nobody is
    // listening yet — they will pick the new row up on next dashboard
    // pull anyway).
    this.broadcastToDriver(input.driverId, {
      dispatchId: dispatch.id,
      driverId: dispatch.driverId,
      customerId: dispatch.customerId,
      status: dispatch.status,
      createdAtIso: dispatch.createdAt.toISOString(),
      completedAtIso: dispatch.completedAt?.toISOString() ?? null,
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
      const result = await this.prisma.dispatch.updateMany({
        where: { id: payload.dispatchId, status: DispatchStatus.ASSIGNED },
        data: {
          status: DispatchStatus.COMPLETED,
          completedAt: new Date(),
          completedByOrderId: payload.orderId,
        },
      });
      if (result.count === 0) {
        // Dispatch already closed (or never existed). Either is fine
        // — duplicate event is a no-op.
        return;
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
        },
      });

      const stream: DispatchStreamEventPayload = {
        dispatchId: closed.id,
        driverId: closed.driverId,
        customerId: closed.customerId,
        status: closed.status,
        createdAtIso: closed.createdAt.toISOString(),
        completedAtIso: closed.completedAt?.toISOString() ?? null,
      };
      this.broadcastToDriver(closed.driverId, stream);
      this.events.emit(DISPATCH_COMPLETED_EVENT, stream);
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
   * Active dispatches for the call-center dashboard. Only ASSIGNED
   * rows are returned; COMPLETED rows have their own history endpoint
   * (intentionally not implemented here — the UI is a live ops queue,
   * not a journal).
   */
  async listActive(
    input: {
      limit?: number;
    } = {},
  ): Promise<DispatchSnapshotDto> {
    const limit = clampPositive(input.limit, 200, 50);
    const rows = await this.prisma.dispatch.findMany({
      where: { status: DispatchStatus.ASSIGNED },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: {
        customer: { select: { displayName: true, phone: true } },
        driver: { select: { fullName: true, username: true } },
      },
    });
    const now = new Date();
    return {
      generatedAtIso: now.toISOString(),
      rows: rows.map((r) =>
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
   * Driver's own queue. We only show ASSIGNED rows + the most recent
   * COMPLETED ones (so the driver sees what was just closed without
   * the page jumping). The driver CANNOT modify any field — read
   * only.
   */
  async listForDriver(driverId: string): Promise<DispatchSnapshotDto> {
    const rows = await this.prisma.dispatch.findMany({
      where: {
        driverId,
        OR: [
          { status: DispatchStatus.ASSIGNED },
          {
            status: DispatchStatus.COMPLETED,
            completedAt: { gte: oneHourAgo() },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        customer: { select: { displayName: true, phone: true } },
        driver: { select: { fullName: true, username: true } },
      },
    });
    const now = new Date();
    return {
      generatedAtIso: now.toISOString(),
      rows: rows.map((r) =>
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

  // ---------------------------------------------------------------------------
  // ESCALATION + REASSIGNMENT (Part 1, Part 4 of the reliability brief)
  // ---------------------------------------------------------------------------

  /**
   * Pick a single ASSIGNED driver other than `excludeDriverId`. Tie-
   * breaks on the driver who currently holds the FEWEST ASSIGNED
   * dispatches (lightweight load-balancer; cheap because the count
   * comes from the same indexed `(driverId, status, createdAt)`
   * tuple). Returns `null` when no alternative driver exists — the
   * caller must skip the escalation in that case rather than create
   * a self-loop.
   */
  async pickAlternateDriver(
    excludeDriverId: string,
  ): Promise<{ id: string } | null> {
    const candidates = await this.prisma.user.findMany({
      where: {
        safariRole: SafariRole.DRIVER,
        isActive: true,
        id: { not: excludeDriverId },
      },
      select: { id: true },
    });
    if (candidates.length === 0) return null;

    // One round-trip groupBy keeps us from N+1.
    const loads = await this.prisma.dispatch.groupBy({
      by: ['driverId'],
      where: {
        status: DispatchStatus.ASSIGNED,
        driverId: { in: candidates.map((c) => c.id) },
      },
      _count: { _all: true },
    });
    const loadById = new Map<string, number>(
      loads.map((row) => [row.driverId, row._count._all]),
    );

    return candidates
      .map((c) => ({ id: c.id, load: loadById.get(c.id) ?? 0 }))
      .sort((a, b) => a.load - b.load)[0];
  }

  /**
   * Find the ASSIGNED dispatches that are eligible for auto-
   * escalation: older than `minAgeMinutes` AND have no successor
   * yet. The "no successor" predicate (`children: { none: {} }`) is
   * the application-level idempotency key — without it the cron
   * would fan out a new dispatch every tick.
   */
  async findEscalationCandidates(
    minAgeMinutes: number,
    limit = 50,
  ): Promise<
    Array<Pick<Dispatch, 'id' | 'customerId' | 'driverId' | 'instructionNote'>>
  > {
    const cutoff = new Date(Date.now() - minAgeMinutes * 60_000);
    return this.prisma.dispatch.findMany({
      where: {
        status: DispatchStatus.ASSIGNED,
        createdAt: { lt: cutoff },
        children: { none: {} },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true,
        customerId: true,
        driverId: true,
        instructionNote: true,
      },
    });
  }

  /**
   * Promote a single overdue dispatch to a successor row pointing at
   * a fresh driver. The original is intentionally LEFT in ASSIGNED —
   * Order is still the only completer. Used by both the auto-
   * escalation cron and the manual call-center reassign endpoint.
   *
   * Returns `null` when no alternative driver could be found, so the
   * cron can skip + log instead of crashing.
   */
  async createSuccessor(input: {
    parent: Pick<
      Dispatch,
      'id' | 'customerId' | 'driverId' | 'instructionNote'
    >;
    newDriverId: string;
    instructionNote: string | null;
    actorUserId: string | null;
  }): Promise<Dispatch> {
    return this.prisma.dispatch.create({
      data: {
        customerId: input.parent.customerId,
        driverId: input.newDriverId,
        instructionNote: input.instructionNote?.trim() || null,
        createdByUserId: input.actorUserId,
        parentDispatchId: input.parent.id,
        // status + createdAt take their defaults (ASSIGNED, now()).
      },
    });
  }

  /**
   * AUTO-ESCALATION (cron). Wraps the candidate fetch + per-row
   * successor creation + audit + SSE broadcast. Returns the count of
   * dispatches actually escalated (not just inspected) so the caller
   * can record reliability metrics.
   *
   * Idempotent: a parent that already has any child is filtered out
   * by `findEscalationCandidates`. A second cron tick for the same
   * parent is a guaranteed no-op.
   */
  async runEscalationOnce(input: {
    minAgeMinutes: number;
    limit?: number;
  }): Promise<{ inspected: number; escalated: number; skipped: number }> {
    const candidates = await this.findEscalationCandidates(
      input.minAgeMinutes,
      input.limit ?? 50,
    );
    let escalated = 0;
    let skipped = 0;
    for (const parent of candidates) {
      const next = await this.pickAlternateDriver(parent.driverId);
      if (!next) {
        skipped += 1;
        this.logger.warn(
          `dispatch_escalation_skipped reason=NO_ALTERNATE_DRIVER parentId=${parent.id}`,
        );
        continue;
      }
      const successor = await this.createSuccessor({
        parent,
        newDriverId: next.id,
        instructionNote: `تصعيد تلقائي بعد ${input.minAgeMinutes} دقيقة`,
        actorUserId: null, // system actor
      });
      this.auditLogs.log({
        action: 'DISPATCH_ESCALATED',
        resource: 'dispatch',
        status: 'SUCCESS',
        userId: null,
        role: 'SYSTEM',
        customerId: parent.customerId,
        source: 'AUTO_ESCALATION_CRON',
        changes: {
          parentDispatchId: parent.id,
          successorDispatchId: successor.id,
          previousDriverId: parent.driverId,
          newDriverId: next.id,
          minAgeMinutes: input.minAgeMinutes,
        },
      });
      this.broadcastToDriver(next.id, {
        dispatchId: successor.id,
        driverId: successor.driverId,
        customerId: successor.customerId,
        status: successor.status,
        createdAtIso: successor.createdAt.toISOString(),
        completedAtIso: null,
      });
      this.events.emit(DISPATCH_CREATED_EVENT, successor);
      escalated += 1;
    }
    return { inspected: candidates.length, escalated, skipped };
  }

  /**
   * MANUAL REASSIGN by CALL_CENTER agent (Part 4 of brief).
   *
   * Validates:
   *   - dispatch exists AND is still ASSIGNED;
   *   - new driver exists, is active, and has SafariRole DRIVER;
   *   - new driver != current driver.
   *
   * Mutation:
   *   - creates a successor (parentDispatchId = current.id);
   *   - leaves the original in ASSIGNED (Order remains the only
   *     completer for either row).
   */
  async reassign(input: {
    dispatchId: string;
    newDriverId: string;
    reason: string | null;
    actorUserId: string | null;
    actorRole: string | null;
  }): Promise<Dispatch> {
    const current = await this.prisma.dispatch.findUnique({
      where: { id: input.dispatchId },
      select: {
        id: true,
        status: true,
        customerId: true,
        driverId: true,
        instructionNote: true,
      },
    });
    if (!current) {
      throw new NotFoundException({
        code: 'DISPATCH_NOT_FOUND',
        dispatchId: input.dispatchId,
      });
    }
    if (current.status !== DispatchStatus.ASSIGNED) {
      throw new BadRequestException({
        code: 'DISPATCH_NOT_ASSIGNED',
        dispatchId: current.id,
        currentStatus: current.status,
      });
    }
    if (current.driverId === input.newDriverId) {
      throw new BadRequestException({
        code: 'DRIVER_UNCHANGED',
        dispatchId: current.id,
      });
    }
    const newDriver = await this.prisma.user.findUnique({
      where: { id: input.newDriverId },
      select: { id: true, isActive: true, safariRole: true },
    });
    if (!newDriver || !newDriver.isActive) {
      throw new NotFoundException({
        code: 'DRIVER_NOT_FOUND',
        driverId: input.newDriverId,
      });
    }
    if (newDriver.safariRole !== SafariRole.DRIVER) {
      throw new BadRequestException({
        code: 'DRIVER_ROLE_MISMATCH',
        driverId: newDriver.id,
        actualRole: newDriver.safariRole,
      });
    }

    const successor = await this.createSuccessor({
      parent: current,
      newDriverId: input.newDriverId,
      instructionNote:
        input.reason?.trim() || `إعادة توجيه يدوي من قِبل مركز الاتصال`,
      actorUserId: input.actorUserId,
    });

    this.auditLogs.log({
      action: 'DISPATCH_REASSIGNED',
      resource: 'dispatch',
      status: 'SUCCESS',
      userId: input.actorUserId,
      role: input.actorRole,
      customerId: current.customerId,
      source: 'CALL_CENTER_MANUAL',
      changes: {
        parentDispatchId: current.id,
        successorDispatchId: successor.id,
        previousDriverId: current.driverId,
        newDriverId: input.newDriverId,
        reason: input.reason,
      },
    });

    this.broadcastToDriver(successor.driverId, {
      dispatchId: successor.id,
      driverId: successor.driverId,
      customerId: successor.customerId,
      status: successor.status,
      createdAtIso: successor.createdAt.toISOString(),
      completedAtIso: null,
    });
    this.events.emit(DISPATCH_CREATED_EVENT, successor);

    return successor;
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
        status: DispatchStatus.ASSIGNED,
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
    const result = await this.prisma.dispatch.updateMany({
      where: {
        id: input.dispatchId,
        status: DispatchStatus.ASSIGNED,
      },
      data: {
        status: DispatchStatus.COMPLETED,
        completedAt: new Date(),
        completedByOrderId: input.orderId,
      },
    });
    if (result.count === 0) {
      return { closed: false };
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
  subscribeDriverStream(driverId: string): Subject<DispatchStreamEventPayload> {
    const existing = this.driverStreams.get(driverId);
    if (existing) return existing;
    const subject = new Subject<DispatchStreamEventPayload>();
    this.driverStreams.set(driverId, subject);
    return subject;
  }

  /** Tear down the driver's SSE channel when nobody is listening. */
  unsubscribeDriverStream(driverId: string, subject: Subject<unknown>): void {
    const current = this.driverStreams.get(driverId);
    if (current && current === subject) {
      this.driverStreams.delete(driverId);
    }
  }

  private broadcastToDriver(
    driverId: string,
    payload: DispatchStreamEventPayload,
  ): void {
    const subject = this.driverStreams.get(driverId);
    if (!subject) return;
    try {
      subject.next(payload);
    } catch (error: unknown) {
      this.logger.warn(
        `dispatch_sse_broadcast_failed driverId=${driverId} reason=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
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
      completedAtIso: d.completedAt?.toISOString() ?? null,
      completedByOrderId: d.completedByOrderId,
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

function oneHourAgo(): Date {
  const d = new Date();
  d.setMinutes(d.getMinutes() - 60);
  return d;
}

// Re-export the Dispatch row type so consumers can import it from
// this module rather than reaching into @prisma/client directly. The
// service file is the conceptual home of dispatch-shaped data.
export type { Dispatch };
