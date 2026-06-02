import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditStatus,
  GarmentIssueStatus,
  GarmentStage,
  GarmentStageAction,
  GarmentTaskStatus,
  Prisma,
  ProductionDecisionType,
  SafariRole,
  ServiceType,
  StageHandoffStatus,
} from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AddNoteDto,
  GarmentIntakeDto,
  ProductionDecisionDto,
  ReassignTaskDto,
  ReportIssueDto,
  WorkerTaskQueryDto,
} from './dto/production.dto';
import {
  EXCEPTION_STAGES,
  WORKABLE_STAGES,
  handoffSlaMinutes,
  isWorkableStage,
  nextStage,
  readySlaMinutes,
  workTypeForStage,
} from './garment-stage.machine';

const OPEN_ISSUE_STATUSES: GarmentIssueStatus[] = [
  GarmentIssueStatus.OPEN,
  GarmentIssueStatus.UNDER_REVIEW,
];

/** A view-model worker / manager task row. */
export type ProductionTask = {
  garmentId: string;
  orderId: string;
  branchId: string;
  label: string | null;
  stage: GarmentStage;
  taskStatus: GarmentTaskStatus;
  handoffStatus: StageHandoffStatus;
  serviceType: ServiceType;
  pieceCount: number;
  expectedReadyAt: string | null;
  isLate: boolean;
  delayMinutes: number;
  hasOpenIssue: boolean;
  internalNote: string | null;
  acceptedByUserId: string | null;
  assignedWorkerId: string | null;
};

@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  // ─────────────────────────────────────────────────────────────────
  // WORKER SURFACE
  // ─────────────────────────────────────────────────────────────────

  /** Tasks visible to a worker: own accepted/assigned + the open branch queue. */
  async listWorkerTasks(
    user: JwtUser,
    query: WorkerTaskQueryDto,
  ): Promise<ProductionTask[]> {
    if (!user.branchId) {
      return [];
    }
    const stageFilter =
      query.stage && isWorkableStage(query.stage)
        ? [query.stage]
        : WORKABLE_STAGES;
    const rows = await this.prisma.garment.findMany({
      where: {
        branchId: user.branchId,
        currentStage: { in: stageFilter },
        OR: [
          { acceptedByUserId: user.userId },
          { assignedWorkerId: user.userId },
          {
            taskStatus: GarmentTaskStatus.WAITING_NEXT_STAGE,
            assignedWorkerId: null,
          },
        ],
      },
      orderBy: [{ expectedAcceptBy: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });
    const filtered = query.workType
      ? rows.filter((g) => workTypeForStage(g.currentStage) === query.workType)
      : rows;
    return filtered.map((g) => this.toTask(g));
  }

  /** Limited, blame-free timeline for a task assigned to / held by the worker. */
  async getWorkerGarmentTimeline(user: JwtUser, garmentId: string) {
    const garment = await this.loadGarment(garmentId);
    const isHolder =
      garment.acceptedByUserId === user.userId ||
      garment.assignedWorkerId === user.userId;
    const sameBranch = garment.branchId === user.branchId;
    if (!isHolder && !sameBranch) {
      throw new ForbiddenException('This task is not assigned to you.');
    }
    const events = await this.prisma.garmentStageEvent.findMany({
      where: { garmentId },
      orderBy: { createdAt: 'asc' },
      select: {
        fromStage: true,
        toStage: true,
        action: true,
        createdAt: true,
        actorUserId: true,
      },
    });
    // Worker-safe: expose only WHAT happened, and only flag self as actor.
    return {
      garmentId,
      stage: garment.currentStage,
      timeline: events.map((e) => ({
        fromStage: e.fromStage,
        toStage: e.toStage,
        action: e.action,
        at: e.createdAt.toISOString(),
        byMe: e.actorUserId === user.userId,
      })),
    };
  }

  async acceptTask(user: JwtUser, garmentId: string): Promise<ProductionTask> {
    const garment = await this.loadGarment(garmentId);
    this.assertWorkerBranch(user, garment.branchId);
    if (!isWorkableStage(garment.currentStage)) {
      throw new BadRequestException('This garment is not at a workable stage.');
    }
    if (garment.taskStatus !== GarmentTaskStatus.WAITING_NEXT_STAGE) {
      throw new BadRequestException('Task is not waiting to be accepted.');
    }
    if (garment.assignedWorkerId && garment.assignedWorkerId !== user.userId) {
      throw new ForbiddenException('Task is assigned to another worker.');
    }
    const now = new Date();
    const lateBy =
      garment.expectedAcceptBy && now > garment.expectedAcceptBy
        ? minutesBetween(garment.expectedAcceptBy, now)
        : 0;
    const updated = await this.prisma.$transaction(async (tx) => {
      const g = await tx.garment.update({
        where: { id: garmentId },
        data: {
          taskStatus: GarmentTaskStatus.ACCEPTED_BY_WORKER,
          handoffStatus: StageHandoffStatus.ACCEPTED_BY_NEXT_WORKER,
          acceptedByUserId: user.userId,
          assignedWorkerId: user.userId,
          acceptedAt: now,
          delayMinutes: lateBy,
        },
      });
      await this.appendEvent(tx, g, {
        from: g.currentStage,
        to: g.currentStage,
        action: GarmentStageAction.ACCEPTED,
        actorUserId: user.userId,
      });
      return g;
    });
    return this.toTask(updated);
  }

  async startTask(user: JwtUser, garmentId: string): Promise<ProductionTask> {
    const garment = await this.loadGarment(garmentId);
    this.assertWorkerBranch(user, garment.branchId);
    if (garment.taskStatus !== GarmentTaskStatus.ACCEPTED_BY_WORKER) {
      throw new BadRequestException('Task must be accepted before starting.');
    }
    if (garment.acceptedByUserId !== user.userId) {
      throw new ForbiddenException('Only the worker who accepted may start.');
    }
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const g = await tx.garment.update({
        where: { id: garmentId },
        data: { taskStatus: GarmentTaskStatus.IN_PROGRESS, startedAt: now },
      });
      await this.appendEvent(tx, g, {
        from: g.currentStage,
        to: g.currentStage,
        action: GarmentStageAction.STARTED,
        actorUserId: user.userId,
      });
      return g;
    });
    return this.toTask(updated);
  }

  async completeTask(user: JwtUser, garmentId: string): Promise<ProductionTask> {
    const garment = await this.loadGarment(garmentId);
    this.assertWorkerBranch(user, garment.branchId);
    if (garment.taskStatus !== GarmentTaskStatus.IN_PROGRESS) {
      throw new BadRequestException('Only an in-progress task can be completed.');
    }
    if (garment.acceptedByUserId !== user.userId) {
      throw new ForbiddenException('Only the worker who started may complete.');
    }
    if (garment.hasOpenIssue) {
      throw new BadRequestException(
        'Garment has an open issue — resolve it before completing.',
      );
    }
    const now = new Date();
    const startedAt = garment.startedAt ?? garment.acceptedAt ?? now;
    const durationMinutes = minutesBetween(startedAt, now);
    const completedStage = garment.currentStage;
    const target = nextStage(completedStage);

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.appendEvent(tx, garment, {
        from: completedStage,
        to: completedStage,
        action: GarmentStageAction.COMPLETED,
        actorUserId: user.userId,
      });
      await tx.workerProductionLog.create({
        data: {
          userId: user.userId,
          branchId: garment.branchId,
          stage: completedStage,
          garmentId: garment.id,
          orderId: garment.orderId,
          action: GarmentStageAction.COMPLETED,
          startedAt,
          completedAt: now,
          durationMinutes,
        },
      });

      if (target === GarmentStage.READY) {
        const g = await tx.garment.update({
          where: { id: garmentId },
          data: {
            currentStage: GarmentStage.READY,
            taskStatus: GarmentTaskStatus.COMPLETED,
            handoffStatus: StageHandoffStatus.ACCEPTED_BY_NEXT_WORKER,
            completedAt: now,
            acceptedByUserId: null,
            assignedWorkerId: null,
            startedAt: null,
            waitingSince: null,
            expectedAcceptBy: null,
            delayMinutes: 0,
          },
        });
        await this.appendEvent(tx, g, {
          from: completedStage,
          to: GarmentStage.READY,
          action: GarmentStageAction.READY_MARKED,
          actorUserId: user.userId,
        });
        return g;
      }

      const nextWaitStart = now;
      const sla = handoffSlaMinutes(garment.serviceType);
      const g = await tx.garment.update({
        where: { id: garmentId },
        data: {
          currentStage: target ?? completedStage,
          taskStatus: GarmentTaskStatus.WAITING_NEXT_STAGE,
          handoffStatus: StageHandoffStatus.WAITING_NEXT_STAGE,
          handoffFromStage: completedStage,
          waitingSince: nextWaitStart,
          expectedAcceptBy: addMinutes(nextWaitStart, sla),
          acceptedByUserId: null,
          assignedWorkerId: null,
          acceptedAt: null,
          startedAt: null,
          completedAt: null,
          delayMinutes: 0,
        },
      });
      await this.appendEvent(tx, g, {
        from: completedStage,
        to: target ?? completedStage,
        action: GarmentStageAction.HANDED_OFF,
        actorUserId: user.userId,
      });
      return g;
    });
    return this.toTask(updated);
  }

  async reportIssue(
    user: JwtUser,
    garmentId: string,
    dto: ReportIssueDto,
  ): Promise<ProductionTask> {
    const garment = await this.loadGarment(garmentId);
    this.assertWorkerBranch(user, garment.branchId);
    const isHolder =
      garment.acceptedByUserId === user.userId &&
      (garment.taskStatus === GarmentTaskStatus.ACCEPTED_BY_WORKER ||
        garment.taskStatus === GarmentTaskStatus.IN_PROGRESS);
    if (!isHolder) {
      throw new ForbiddenException(
        'You can only report an issue on a task you are working on.',
      );
    }
    const reportedStage = garment.currentStage;
    const prior = await this.prisma.garmentStageEvent.findFirst({
      where: { garmentId, action: GarmentStageAction.COMPLETED },
      orderBy: { createdAt: 'desc' },
      select: { toStage: true, actorUserId: true },
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.garmentIssue.create({
        data: {
          garmentId: garment.id,
          orderId: garment.orderId,
          branchId: garment.branchId,
          reportedByUserId: user.userId,
          stage: reportedStage,
          previousStage: prior?.toStage ?? garment.handoffFromStage ?? null,
          previousActorUserId: prior?.actorUserId ?? null,
          issueType: dto.issueType,
          status: GarmentIssueStatus.OPEN,
          notes: dto.notes?.trim() || null,
          photoUrl: dto.photoUrl?.trim() || null,
        },
      });
      const g = await tx.garment.update({
        where: { id: garmentId },
        data: {
          currentStage: GarmentStage.QUALITY_HOLD,
          taskStatus: GarmentTaskStatus.QUALITY_HOLD,
          hasOpenIssue: true,
          handoffFromStage: reportedStage,
          acceptedByUserId: null,
          assignedWorkerId: null,
          startedAt: null,
          completedAt: null,
        },
      });
      await this.appendEvent(tx, g, {
        from: reportedStage,
        to: GarmentStage.QUALITY_HOLD,
        action: GarmentStageAction.ISSUE_REPORTED,
        actorUserId: user.userId,
        notes: dto.issueType,
      });
      await tx.workerProductionLog.create({
        data: {
          userId: user.userId,
          branchId: garment.branchId,
          stage: reportedStage,
          garmentId: garment.id,
          orderId: garment.orderId,
          action: GarmentStageAction.ISSUE_REPORTED,
          issueReported: true,
          issueAttributedToUserId: prior?.actorUserId ?? null,
        },
      });
      return g;
    });

    this.auditLogs.log({
      userId: user.userId,
      role: user.role,
      action: 'GARMENT_ISSUE_REPORTED',
      resource: 'production_garment',
      orderId: garment.orderId,
      status: AuditStatus.SUCCESS,
      changes: {
        garmentId,
        stage: reportedStage,
        issueType: dto.issueType,
      },
    });
    return this.toTask(updated);
  }

  async addNote(
    user: JwtUser,
    garmentId: string,
    dto: AddNoteDto,
  ): Promise<ProductionTask> {
    const garment = await this.loadGarment(garmentId);
    const canTouch =
      garment.acceptedByUserId === user.userId ||
      garment.assignedWorkerId === user.userId ||
      this.isManagerScope(user, garment.branchId);
    if (!canTouch) {
      throw new ForbiddenException('You cannot add a note to this task.');
    }
    const stamp = new Date().toISOString();
    const line = `[${stamp}] ${dto.note.trim()}`;
    const merged = garment.internalNotes
      ? `${garment.internalNotes}\n${line}`
      : line;
    const updated = await this.prisma.garment.update({
      where: { id: garmentId },
      data: { internalNotes: merged },
    });
    return this.toTask(updated);
  }

  // ─────────────────────────────────────────────────────────────────
  // MANAGER / SUPERVISOR / OWNER SURFACE
  // ─────────────────────────────────────────────────────────────────

  /** Manager intake: create the tracked garments for an order. */
  async intakeGarments(user: JwtUser, dto: GarmentIntakeDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      select: {
        id: true,
        serviceType: true,
        driver: { select: { branchId: true } },
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found.');
    }
    const branchId = order.driver?.branchId ?? user.branchId ?? null;
    if (!branchId) {
      throw new BadRequestException(
        'Cannot determine a branch for these garments.',
      );
    }
    this.assertManagerBranch(user, branchId);

    const specs =
      dto.items && dto.items.length
        ? dto.items.map((i) => ({
            label: i.label?.trim() || null,
            orderLineItemId: i.orderLineItemId ?? null,
          }))
        : Array.from({ length: dto.count ?? 1 }, () => ({
            label: null,
            orderLineItemId: null,
          }));

    const now = new Date();
    const expectedReadyAt = addMinutes(now, readySlaMinutes(order.serviceType));
    const sla = handoffSlaMinutes(order.serviceType);

    const created = await this.prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const spec of specs) {
        const g = await tx.garment.create({
          data: {
            orderId: order.id,
            orderLineItemId: spec.orderLineItemId,
            branchId,
            label: spec.label,
            serviceType: order.serviceType,
            currentStage: GarmentStage.RECEIVED,
            taskStatus: GarmentTaskStatus.WAITING_NEXT_STAGE,
            handoffStatus: StageHandoffStatus.WAITING_NEXT_STAGE,
            waitingSince: now,
            expectedAcceptBy: addMinutes(now, sla),
            expectedReadyAt,
          },
        });
        await this.appendEvent(tx, g, {
          from: null,
          to: GarmentStage.RECEIVED,
          action: GarmentStageAction.HANDED_OFF,
          actorUserId: user.userId,
        });
        ids.push(g.id);
      }
      return ids;
    });

    this.auditLogs.log({
      userId: user.userId,
      role: user.role,
      action: 'GARMENT_INTAKE',
      resource: 'production_garment',
      orderId: order.id,
      status: AuditStatus.SUCCESS,
      changes: { orderId: order.id, count: created.length, branchId },
    });
    return { orderId: order.id, branchId, created: created.length, garmentIds: created };
  }

  /** Branch production board (manager: own branch, owner/GM/supervisor: all). */
  async getBoard(user: JwtUser) {
    const where = this.scopedBranchWhere(user);
    const garments = await this.prisma.garment.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 2000,
    });
    const now = new Date();
    const byStage: Record<string, number> = {};
    let delayed = 0;
    let waitingBetweenStages = 0;
    const activeWorkers = new Set<string>();
    for (const g of garments) {
      byStage[g.currentStage] = (byStage[g.currentStage] ?? 0) + 1;
      if (g.taskStatus === GarmentTaskStatus.WAITING_NEXT_STAGE) {
        waitingBetweenStages += 1;
      }
      if (this.isLate(g, now)) {
        delayed += 1;
      }
      if (
        g.taskStatus === GarmentTaskStatus.IN_PROGRESS &&
        g.acceptedByUserId
      ) {
        activeWorkers.add(g.acceptedByUserId);
      }
    }
    const openIssues = await this.prisma.garmentIssue.count({
      where: {
        status: { in: OPEN_ISSUE_STATUSES },
        ...(this.isManagerScope(user, user.branchId)
          ? { branchId: user.branchId ?? '__none__' }
          : {}),
      },
    });
    return {
      scope: this.scopeLabel(user),
      countsByStage: byStage,
      delayedGarments: delayed,
      waitingBetweenStages,
      openIssues,
      activeWorkers: activeWorkers.size,
      delayedList: garments
        .filter((g) => this.isLate(g, now))
        .slice(0, 100)
        .map((g) => this.toTask(g)),
    };
  }

  async getGarmentTimeline(user: JwtUser, garmentId: string) {
    const garment = await this.loadGarment(garmentId);
    this.assertManagerBranch(user, garment.branchId, /*allowSupervisor*/ true);
    const events = await this.prisma.garmentStageEvent.findMany({
      where: { garmentId },
      orderBy: { createdAt: 'asc' },
    });
    const issues = await this.prisma.garmentIssue.findMany({
      where: { garmentId },
      orderBy: { createdAt: 'asc' },
      include: { decisions: { orderBy: { createdAt: 'asc' } } },
    });
    return {
      garment: this.toTask(garment),
      timeline: events.map((e) => ({
        fromStage: e.fromStage,
        toStage: e.toStage,
        action: e.action,
        actorUserId: e.actorUserId,
        notes: e.notes,
        at: e.createdAt.toISOString(),
      })),
      issues,
    };
  }

  async getWorkerLogs(user: JwtUser, workerId: string) {
    const where: Prisma.WorkerProductionLogWhereInput = { userId: workerId };
    if (this.isManagerScope(user, user.branchId)) {
      where.branchId = user.branchId ?? '__none__';
    }
    const logs = await this.prisma.workerProductionLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const completed = logs.filter(
      (l) => l.action === GarmentStageAction.COMPLETED,
    );
    const durations = completed
      .map((l) => l.durationMinutes ?? 0)
      .filter((d) => d > 0);
    return {
      workerId,
      totalTasks: completed.length,
      issuesReported: logs.filter((l) => l.issueReported).length,
      avgDurationMinutes: durations.length
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0,
      logs: logs.map((l) => ({
        stage: l.stage,
        action: l.action,
        startedAt: l.startedAt?.toISOString() ?? null,
        completedAt: l.completedAt?.toISOString() ?? null,
        durationMinutes: l.durationMinutes,
        issueReported: l.issueReported,
        at: l.createdAt.toISOString(),
      })),
    };
  }

  async listIssues(user: JwtUser) {
    const where: Prisma.GarmentIssueWhereInput = {
      status: { in: OPEN_ISSUE_STATUSES },
    };
    if (this.isManagerScope(user, user.branchId)) {
      where.branchId = user.branchId ?? '__none__';
    }
    const issues = await this.prisma.garmentIssue.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        garment: { select: { label: true, currentStage: true, serviceType: true } },
      },
    });
    return issues;
  }

  async decideIssue(
    user: JwtUser,
    issueId: string,
    dto: ProductionDecisionDto,
  ) {
    const issue = await this.prisma.garmentIssue.findUnique({
      where: { id: issueId },
      include: { garment: true },
    });
    if (!issue || !issue.garment) {
      throw new NotFoundException('Issue not found.');
    }
    this.assertManagerBranch(user, issue.branchId);
    if (
      issue.status === GarmentIssueStatus.CLOSED ||
      issue.status === GarmentIssueStatus.DAMAGED ||
      issue.status === GarmentIssueStatus.LOST
    ) {
      throw new BadRequestException('This issue is already resolved.');
    }

    const plan = this.decisionPlan(dto.decision);
    const now = new Date();

    if (dto.decision === ProductionDecisionType.APPROVE_AS_READY) {
      const otherOpen = await this.prisma.garmentIssue.count({
        where: {
          garmentId: issue.garmentId,
          id: { not: issue.id },
          status: { in: OPEN_ISSUE_STATUSES },
        },
      });
      if (otherOpen > 0) {
        throw new BadRequestException(
          'Other open issues remain — cannot approve as ready.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.productionDecision.create({
        data: {
          issueId: issue.id,
          garmentId: issue.garmentId,
          orderId: issue.orderId,
          decidedByUserId: user.userId,
          decision: dto.decision,
          notes: dto.notes?.trim() || null,
          nextStage: plan.targetStage,
          customerContactRequired: dto.customerContactRequired ?? false,
          compensationRequired: dto.compensationRequired ?? false,
        },
      });
      await tx.garmentIssue.update({
        where: { id: issue.id },
        data: {
          status: plan.issueStatus,
          closedAt: plan.closeIssue ? now : null,
        },
      });

      const garmentData: Prisma.GarmentUpdateInput = {};
      if (plan.targetStage) {
        garmentData.currentStage = plan.targetStage;
      }
      if (plan.reEnterQueue && plan.targetStage) {
        const sla = handoffSlaMinutes(issue.garment!.serviceType);
        garmentData.taskStatus = GarmentTaskStatus.WAITING_NEXT_STAGE;
        garmentData.handoffStatus = StageHandoffStatus.WAITING_NEXT_STAGE;
        garmentData.handoffFromStage = GarmentStage.QUALITY_HOLD;
        garmentData.waitingSince = now;
        garmentData.expectedAcceptBy = addMinutes(now, sla);
        garmentData.acceptedByUserId = null;
        garmentData.assignedWorkerId = null;
        garmentData.startedAt = null;
        garmentData.completedAt = null;
        garmentData.delayMinutes = 0;
      } else if (plan.decisionTaskStatus) {
        garmentData.taskStatus = plan.decisionTaskStatus;
      }

      const g = await tx.garment.update({
        where: { id: issue.garmentId },
        data: garmentData,
      });

      // Recompute open-issue flag after this decision.
      const stillOpen = await tx.garmentIssue.count({
        where: {
          garmentId: issue.garmentId,
          status: { in: OPEN_ISSUE_STATUSES },
        },
      });
      await tx.garment.update({
        where: { id: issue.garmentId },
        data: { hasOpenIssue: stillOpen > 0 },
      });

      await this.appendEvent(tx, g, {
        from: GarmentStage.QUALITY_HOLD,
        to: plan.targetStage ?? g.currentStage,
        action: plan.reEnterQueue
          ? GarmentStageAction.REWORK_SENT
          : GarmentStageAction.DECISION_MADE,
        actorUserId: user.userId,
        notes: dto.decision,
      });
    });

    this.auditLogs.log({
      userId: user.userId,
      role: user.role,
      action: 'GARMENT_DECISION_MADE',
      resource: 'production_garment',
      orderId: issue.orderId,
      status: AuditStatus.SUCCESS,
      changes: {
        garmentId: issue.garmentId,
        issueId: issue.id,
        decision: dto.decision,
        compensationRequired: dto.compensationRequired ?? false,
      },
    });
    return this.getGarmentTimeline(user, issue.garmentId);
  }

  async reassignTask(
    user: JwtUser,
    garmentId: string,
    dto: ReassignTaskDto,
  ): Promise<ProductionTask> {
    const garment = await this.loadGarment(garmentId);
    this.assertManagerBranch(user, garment.branchId);
    const updated = await this.prisma.garment.update({
      where: { id: garmentId },
      data: { assignedWorkerId: dto.workerId ?? null },
    });
    this.auditLogs.log({
      userId: user.userId,
      role: user.role,
      action: 'GARMENT_TASK_REASSIGNED',
      resource: 'production_garment',
      orderId: garment.orderId,
      status: AuditStatus.SUCCESS,
      changes: { garmentId, assignedWorkerId: dto.workerId ?? null },
    });
    return this.toTask(updated);
  }

  /** Owner cross-branch dashboard: bottlenecks, delays, issue rates. */
  async getOwnerDashboard(user: JwtUser) {
    if (
      user.role !== SafariRole.OWNER &&
      user.role !== SafariRole.GENERAL_MANAGER
    ) {
      throw new ForbiddenException('Owner / GM only.');
    }
    const now = new Date();
    const garments = await this.prisma.garment.findMany({ take: 5000 });
    const branches: Record<
      string,
      { total: number; delayed: number; ready: number; damaged: number; lost: number }
    > = {};
    const stageWaits: Record<string, number> = {};
    for (const g of garments) {
      const b = (branches[g.branchId] ??= {
        total: 0,
        delayed: 0,
        ready: 0,
        damaged: 0,
        lost: 0,
      });
      b.total += 1;
      if (this.isLate(g, now)) b.delayed += 1;
      if (g.currentStage === GarmentStage.READY) b.ready += 1;
      if (g.currentStage === GarmentStage.DAMAGED_REVIEW) b.damaged += 1;
      if (g.currentStage === GarmentStage.LOST_REVIEW) b.lost += 1;
      if (g.taskStatus === GarmentTaskStatus.WAITING_NEXT_STAGE) {
        stageWaits[g.currentStage] = (stageWaits[g.currentStage] ?? 0) + 1;
      }
    }
    const openIssues = await this.prisma.garmentIssue.groupBy({
      by: ['issueType'],
      where: { status: { in: OPEN_ISSUE_STATUSES } },
      _count: { _all: true },
    });
    const bottlenecks = Object.entries(stageWaits)
      .sort((a, b) => b[1] - a[1])
      .map(([stage, waiting]) => ({ stage, waiting }));
    return {
      branches,
      bottlenecks,
      delayedHandoffs: garments.filter((g) => this.isLate(g, now)).length,
      issueRates: openIssues.map((i) => ({
        issueType: i.issueType,
        count: i._count._all,
      })),
      lostCount: garments.filter(
        (g) => g.currentStage === GarmentStage.LOST_REVIEW,
      ).length,
      damagedCount: garments.filter(
        (g) => g.currentStage === GarmentStage.DAMAGED_REVIEW,
      ).length,
    };
  }

  /**
   * Customer-safe order production status — NO worker names, NO blame, NO
   * disciplinary / compensation detail. Consumed by Call Center to update
   * the customer.
   */
  async getCustomerOrderStatus(orderId: string) {
    const garments = await this.prisma.garment.findMany({
      where: { orderId },
      select: {
        currentStage: true,
        taskStatus: true,
        expectedReadyAt: true,
        handoffStatus: true,
      },
    });
    if (!garments.length) {
      return {
        orderId,
        tracked: false,
        stage: null,
        isDelayed: false,
        needsAttention: false,
        note: 'لم تدخل القطع مرحلة الإنتاج بعد.',
      };
    }
    const now = new Date();
    const isDelayed = garments.some(
      (g) =>
        g.handoffStatus === StageHandoffStatus.DELAYED_HANDOFF ||
        (g.expectedReadyAt != null &&
          now > g.expectedReadyAt &&
          g.currentStage !== GarmentStage.READY &&
          g.currentStage !== GarmentStage.DELIVERED),
    );
    const needsAttention = garments.some(
      (g) =>
        g.currentStage === GarmentStage.DAMAGED_REVIEW ||
        g.currentStage === GarmentStage.LOST_REVIEW ||
        g.currentStage === GarmentStage.QUALITY_HOLD,
    );
    // Customer-facing "stage" is the least-advanced normal stage.
    const order: GarmentStage[] = [
      GarmentStage.RECEIVED,
      GarmentStage.SORTING,
      GarmentStage.WASHING,
      GarmentStage.DRYING,
      GarmentStage.IRONING,
      GarmentStage.PACKING,
      GarmentStage.QC_CHECK,
      GarmentStage.READY,
      GarmentStage.DELIVERED,
    ];
    const ranks = garments.map((g) => {
      const r = order.indexOf(g.currentStage);
      return r < 0 ? 0 : r;
    });
    const minRank = Math.min(...ranks);
    const stage = order[minRank] ?? GarmentStage.RECEIVED;
    return {
      orderId,
      tracked: true,
      stage,
      isDelayed,
      needsAttention,
      note: needsAttention
        ? 'طلبك قيد المراجعة لضمان الجودة، وسنبقيك على اطلاع.'
        : isDelayed
          ? 'طلبك قيد التجهيز وقد يستغرق وقتاً إضافياً بسيطاً.'
          : 'طلبك قيد التجهيز حسب الجدول.',
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────

  private decisionPlan(decision: ProductionDecisionType): {
    targetStage: GarmentStage | null;
    issueStatus: GarmentIssueStatus;
    closeIssue: boolean;
    reEnterQueue: boolean;
    decisionTaskStatus?: GarmentTaskStatus;
  } {
    switch (decision) {
      case ProductionDecisionType.REWASH:
        return {
          targetStage: GarmentStage.WASHING,
          issueStatus: GarmentIssueStatus.REWORKING,
          closeIssue: false,
          reEnterQueue: true,
        };
      case ProductionDecisionType.REIRON:
        return {
          targetStage: GarmentStage.IRONING,
          issueStatus: GarmentIssueStatus.REWORKING,
          closeIssue: false,
          reEnterQueue: true,
        };
      case ProductionDecisionType.REPAIR:
        // Repair is finished at the ironing/finishing station, then re-QC'd.
        return {
          targetStage: GarmentStage.IRONING,
          issueStatus: GarmentIssueStatus.REWORKING,
          closeIssue: false,
          reEnterQueue: true,
        };
      case ProductionDecisionType.APPROVE_AS_READY:
        return {
          targetStage: GarmentStage.READY,
          issueStatus: GarmentIssueStatus.CLOSED,
          closeIssue: true,
          reEnterQueue: false,
          decisionTaskStatus: GarmentTaskStatus.COMPLETED,
        };
      case ProductionDecisionType.ESCALATE_TO_OWNER:
        return {
          targetStage: GarmentStage.QUALITY_HOLD,
          issueStatus: GarmentIssueStatus.UNDER_REVIEW,
          closeIssue: false,
          reEnterQueue: false,
          decisionTaskStatus: GarmentTaskStatus.QUALITY_HOLD,
        };
      case ProductionDecisionType.MARK_DAMAGED:
        return {
          targetStage: GarmentStage.DAMAGED_REVIEW,
          issueStatus: GarmentIssueStatus.DAMAGED,
          closeIssue: true,
          reEnterQueue: false,
          decisionTaskStatus: GarmentTaskStatus.QUALITY_HOLD,
        };
      case ProductionDecisionType.MARK_LOST:
        return {
          targetStage: GarmentStage.LOST_REVIEW,
          issueStatus: GarmentIssueStatus.LOST,
          closeIssue: true,
          reEnterQueue: false,
          decisionTaskStatus: GarmentTaskStatus.QUALITY_HOLD,
        };
      default:
        throw new BadRequestException('Unknown decision.');
    }
  }

  private async loadGarment(garmentId: string) {
    const garment = await this.prisma.garment.findUnique({
      where: { id: garmentId },
    });
    if (!garment) {
      throw new NotFoundException('Garment not found.');
    }
    return garment;
  }

  private async appendEvent(
    tx: Prisma.TransactionClient,
    garment: { id: string; orderId: string; branchId: string },
    e: {
      from: GarmentStage | null;
      to: GarmentStage;
      action: GarmentStageAction;
      actorUserId: string | null;
      notes?: string | null;
    },
  ): Promise<void> {
    await tx.garmentStageEvent.create({
      data: {
        garmentId: garment.id,
        orderId: garment.orderId,
        branchId: garment.branchId,
        fromStage: e.from,
        toStage: e.to,
        action: e.action,
        actorUserId: e.actorUserId,
        notes: e.notes ?? null,
      },
    });
  }

  private assertWorkerBranch(user: JwtUser, branchId: string): void {
    if (user.role === SafariRole.OWNER) return;
    if (user.branchId !== branchId) {
      throw new ForbiddenException('Task belongs to another branch.');
    }
  }

  private assertManagerBranch(
    user: JwtUser,
    branchId: string,
    allowSupervisor = false,
  ): void {
    if (
      user.role === SafariRole.OWNER ||
      user.role === SafariRole.GENERAL_MANAGER
    ) {
      return;
    }
    if (allowSupervisor && user.role === SafariRole.SUPERVISOR) {
      return;
    }
    if (user.role === SafariRole.MANAGER && user.branchId === branchId) {
      return;
    }
    throw new ForbiddenException('Not permitted for this branch.');
  }

  private isManagerScope(user: JwtUser, _branchId: string | null): boolean {
    return user.role === SafariRole.MANAGER;
  }

  private scopedBranchWhere(user: JwtUser): Prisma.GarmentWhereInput {
    if (user.role === SafariRole.MANAGER) {
      return { branchId: user.branchId ?? '__none__' };
    }
    return {};
  }

  private scopeLabel(user: JwtUser): string {
    return user.role === SafariRole.MANAGER ? 'BRANCH' : 'ALL_BRANCHES';
  }

  private isLate(
    g: {
      taskStatus: GarmentTaskStatus;
      handoffStatus: StageHandoffStatus;
      expectedAcceptBy: Date | null;
      expectedReadyAt: Date | null;
      currentStage: GarmentStage;
    },
    now: Date,
  ): boolean {
    if (g.handoffStatus === StageHandoffStatus.DELAYED_HANDOFF) return true;
    if (
      g.taskStatus === GarmentTaskStatus.WAITING_NEXT_STAGE &&
      g.expectedAcceptBy != null &&
      now > g.expectedAcceptBy
    ) {
      return true;
    }
    if (
      g.expectedReadyAt != null &&
      now > g.expectedReadyAt &&
      g.currentStage !== GarmentStage.READY &&
      g.currentStage !== GarmentStage.DELIVERED &&
      !EXCEPTION_STAGES.includes(g.currentStage)
    ) {
      return true;
    }
    return false;
  }

  private toTask(g: {
    id: string;
    orderId: string;
    branchId: string;
    label: string | null;
    currentStage: GarmentStage;
    taskStatus: GarmentTaskStatus;
    handoffStatus: StageHandoffStatus;
    serviceType: ServiceType;
    expectedReadyAt: Date | null;
    expectedAcceptBy: Date | null;
    delayMinutes: number;
    hasOpenIssue: boolean;
    internalNotes: string | null;
    acceptedByUserId: string | null;
    assignedWorkerId: string | null;
  }): ProductionTask {
    const now = new Date();
    return {
      garmentId: g.id,
      orderId: g.orderId,
      branchId: g.branchId,
      label: g.label,
      stage: g.currentStage,
      taskStatus: g.taskStatus,
      handoffStatus: g.handoffStatus,
      serviceType: g.serviceType,
      pieceCount: 1,
      expectedReadyAt: g.expectedReadyAt?.toISOString() ?? null,
      isLate: this.isLate(g, now),
      delayMinutes: g.delayMinutes,
      hasOpenIssue: g.hasOpenIssue,
      internalNote: g.internalNotes,
      acceptedByUserId: g.acceptedByUserId,
      assignedWorkerId: g.assignedWorkerId,
    };
  }
}

function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
}

function addMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60000);
}
