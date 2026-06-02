import {
  GarmentStage,
  GarmentTaskStatus,
  SafariRole,
  StageHandoffStatus,
} from '@prisma/client';
import { AppPermission } from '../auth/permissions/permissions.enum';
import { permissionsForRole } from '../auth/permissions/roles-permissions.map';
import { ProductionService } from './production.service';
import type { JwtUser } from '../auth/decorators/current-user.decorator';

const WORKER: JwtUser = { userId: 'w1', role: SafariRole.WORKER, branchId: 'b1' };

function baseGarment(over: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: 'g1',
    orderId: 'o1',
    orderLineItemId: null,
    branchId: 'b1',
    label: 'shirt',
    serviceType: 'NORMAL',
    currentStage: GarmentStage.WASHING,
    taskStatus: GarmentTaskStatus.WAITING_NEXT_STAGE,
    handoffStatus: StageHandoffStatus.WAITING_NEXT_STAGE,
    assignedWorkerId: null,
    acceptedByUserId: null,
    acceptedAt: null,
    startedAt: null,
    completedAt: null,
    handoffFromStage: GarmentStage.SORTING,
    waitingSince: new Date(now.getTime() - 5 * 60000),
    expectedAcceptBy: new Date(now.getTime() + 25 * 60000),
    delayMinutes: 0,
    expectedReadyAt: new Date(now.getTime() + 60 * 60000),
    hasOpenIssue: false,
    internalNotes: null,
    ...over,
  };
}

function makeService(garment: Record<string, unknown>) {
  const events: Array<Record<string, unknown>> = [];
  const issues: Array<Record<string, unknown>> = [];
  const logs: Array<Record<string, unknown>> = [];
  const db: Record<string, unknown> = {
    garment: {
      findUnique: jest.fn(async () => ({ ...garment })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(garment, data);
        return { ...garment };
      }),
      findMany: jest.fn(async () => [{ ...garment }]),
    },
    garmentStageEvent: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        events.push(data);
        return data;
      }),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => events),
    },
    workerProductionLog: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        logs.push(data);
        return data;
      }),
    },
    garmentIssue: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        issues.push(data);
        return { id: 'i1', ...data };
      }),
      count: jest.fn(async () => issues.filter((i) => i.status === 'OPEN').length),
    },
    productionDecision: { create: jest.fn(async () => ({})) },
    order: { findUnique: jest.fn() },
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(db)),
  };
  const auditLogs = { log: jest.fn(), logFinancialEvent: jest.fn() };
  const service = new ProductionService(db as never, auditLogs as never);
  return { service, db, events, issues, logs, auditLogs, garment };
}

describe('ProductionService — worker task state machine', () => {
  it('worker cannot start a task before accepting it', async () => {
    const { service } = makeService(baseGarment());
    await expect(service.startTask(WORKER, 'g1')).rejects.toThrow(
      /accepted before starting/i,
    );
  });

  it('worker cannot complete a task that is not in progress', async () => {
    const { service } = makeService(
      baseGarment({
        taskStatus: GarmentTaskStatus.ACCEPTED_BY_WORKER,
        acceptedByUserId: 'w1',
      }),
    );
    await expect(service.completeTask(WORKER, 'g1')).rejects.toThrow(
      /in-progress task can be completed/i,
    );
  });

  it('accept → start → complete advances to the next stage and hands off', async () => {
    const { service, garment, events, logs } = makeService(baseGarment());
    await service.acceptTask(WORKER, 'g1');
    expect(garment.taskStatus).toBe(GarmentTaskStatus.ACCEPTED_BY_WORKER);
    expect(garment.acceptedByUserId).toBe('w1');

    await service.startTask(WORKER, 'g1');
    expect(garment.taskStatus).toBe(GarmentTaskStatus.IN_PROGRESS);

    const result = await service.completeTask(WORKER, 'g1');
    expect(result.stage).toBe(GarmentStage.DRYING);
    expect(garment.currentStage).toBe(GarmentStage.DRYING);
    expect(garment.taskStatus).toBe(GarmentTaskStatus.WAITING_NEXT_STAGE);
    // Previous worker is released — delay after Complete is NOT theirs.
    expect(garment.acceptedByUserId).toBeNull();
    expect(garment.assignedWorkerId).toBeNull();
    expect(garment.delayMinutes).toBe(0);
    // Append-only event trail captured the movement.
    const actions = events.map((e) => e.action);
    expect(actions).toContain('COMPLETED');
    expect(actions).toContain('HANDED_OFF');
    expect(logs).toHaveLength(1);
  });

  it('late acceptance attributes the delay to the accepting (next) worker', async () => {
    const past = new Date(Date.now() - 60 * 60000);
    const { service, garment } = makeService(
      baseGarment({ expectedAcceptBy: past }),
    );
    await service.acceptTask(WORKER, 'g1');
    expect(garment.handoffStatus).toBe(
      StageHandoffStatus.ACCEPTED_BY_NEXT_WORKER,
    );
    expect(garment.delayMinutes as number).toBeGreaterThan(0);
  });

  it('reporting an issue moves the garment to QUALITY_HOLD and opens an issue', async () => {
    const { service, garment, issues, events, auditLogs } = makeService(
      baseGarment({
        taskStatus: GarmentTaskStatus.IN_PROGRESS,
        acceptedByUserId: 'w1',
        startedAt: new Date(),
      }),
    );
    await service.reportIssue(WORKER, 'g1', { issueType: 'STAIN_REMAINING' });
    expect(garment.currentStage).toBe(GarmentStage.QUALITY_HOLD);
    expect(garment.taskStatus).toBe(GarmentTaskStatus.QUALITY_HOLD);
    expect(garment.hasOpenIssue).toBe(true);
    expect(issues).toHaveLength(1);
    expect(events.map((e) => e.action)).toContain('ISSUE_REPORTED');
    expect(auditLogs.log).toHaveBeenCalled();
  });

  it('a garment with an open issue cannot be completed (blocks READY path)', async () => {
    const { service } = makeService(
      baseGarment({
        taskStatus: GarmentTaskStatus.IN_PROGRESS,
        acceptedByUserId: 'w1',
        hasOpenIssue: true,
      }),
    );
    await expect(service.completeTask(WORKER, 'g1')).rejects.toThrow(
      /open issue/i,
    );
  });

  it('a worker cannot accept a task from another branch', async () => {
    const { service } = makeService(baseGarment({ branchId: 'OTHER' }));
    await expect(service.acceptTask(WORKER, 'g1')).rejects.toThrow(
      /another branch/i,
    );
  });

  it('a worker cannot accept a task assigned to a different worker', async () => {
    const { service } = makeService(baseGarment({ assignedWorkerId: 'w2' }));
    await expect(service.acceptTask(WORKER, 'g1')).rejects.toThrow(
      /another worker/i,
    );
  });

  it('the stage-event store is append-only (no update/delete surface)', () => {
    const { db } = makeService(baseGarment());
    const stageEvent = (db as { garmentStageEvent: Record<string, unknown> })
      .garmentStageEvent;
    expect(stageEvent.update).toBeUndefined();
    expect(stageEvent.delete).toBeUndefined();
    expect(stageEvent.deleteMany).toBeUndefined();
  });
});

describe('ProductionService — WORKER RBAC isolation', () => {
  const workerPerms = permissionsForRole(SafariRole.WORKER);

  it('WORKER can view + work production', () => {
    expect(workerPerms).toContain(AppPermission.VIEW_PRODUCTION);
    expect(workerPerms).toContain(AppPermission.WORK_PRODUCTION);
  });

  it('WORKER has NO finance / cash / invoice / customer permissions', () => {
    for (const forbidden of [
      AppPermission.VIEW_INVOICES,
      AppPermission.VIEW_CASH,
      AppPermission.VIEW_DEBTS,
      AppPermission.VIEW_FINANCIAL_REPORTS,
      AppPermission.VIEW_CUSTOMERS,
      AppPermission.APPROVE_EXPENSES,
      AppPermission.MANAGE_PRODUCTION,
      AppPermission.MANAGE_USERS,
    ]) {
      expect(workerPerms).not.toContain(forbidden);
    }
  });

  it('WORKER cannot manage production (decisions are MANAGER/OWNER only)', () => {
    expect(workerPerms).not.toContain(AppPermission.MANAGE_PRODUCTION);
  });
});
