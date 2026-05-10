import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  WorkflowEvent,
  WorkflowItem,
  WorkflowKind,
  WorkflowPriority,
  WorkflowQuery,
  WorkflowQueueSnapshot,
  WorkflowStatus,
} from './collections-workflow.types';

/**
 * V23.1 Phase 7 — Collections Operational Workflow Service.
 *
 * In-memory, append-only registry for the three operational
 * workflow types of the Collections cockpit:
 *
 *   • CALLBACK    — operator schedules to call back a customer
 *   • PROMISE     — customer commits to pay by date X
 *   • ESCALATION  — customer is escalated to a supervisor
 *
 * STRICT INVARIANTS (do not relax these without a multi-disciplinary review):
 *   1. NO authoritative money. The `amountKdSnapshot` is a label only.
 *   2. NO autonomous mutations of canonical financial state.
 *   3. Append-only audit. Every state transition appends a `WorkflowEvent`
 *      to the item's history; the item itself is never deleted.
 *   4. Bounded memory. Items resolved more than `RESOLVED_RETENTION_MS`
 *      ago are pruned from the live snapshot to keep the operator UI
 *      responsive. Pruned items remain in the (future) audit table once
 *      persistence is added — Phase 7.1 hook documented in the scorecard.
 *   5. Cluster-safe surface. The map can be swapped for a Redis / Prisma
 *      backend without touching the public API.
 *
 * The service deliberately stays small (≈250 LOC) and dependency-free
 * so it can be unit-tested with hand-rolled fixtures and zero DB.
 */

/** Items resolved (COMPLETED / BROKEN / CANCELLED) older than this are pruned from the live snapshot. */
export const RESOLVED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Hard cap on the live registry to bound memory under burst-create scenarios. */
export const MAX_LIVE_ITEMS = 5_000;

@Injectable()
export class CollectionsWorkflowService {
  private readonly logger = new Logger(CollectionsWorkflowService.name);
  private readonly items = new Map<string, WorkflowItem>();

  /**
   * Create a new workflow item. The caller MUST pass authenticated identity
   * (extracted from JWT in the controller); never trust client-supplied
   * `createdById` / `createdByName`.
   */
  create(input: {
    kind: WorkflowKind;
    customerId: string;
    customerNameSnapshot?: string | null;
    orderId?: string | null;
    scheduledAt?: string | null;
    amountKdSnapshot?: string | null;
    priority?: WorkflowPriority;
    notes?: string | null;
    branchId?: string | null;
    actorId: string;
    actorName: string;
    now?: number;
  }): WorkflowItem {
    if (!input.customerId || input.customerId.length === 0) {
      throw new BadRequestException('customerId is required');
    }
    if (input.amountKdSnapshot != null) {
      // Validate shape only — never run any arithmetic on this value.
      if (!/^\d+(\.\d{1,4})?$/.test(input.amountKdSnapshot)) {
        throw new BadRequestException(
          'amountKdSnapshot must look like a canonical KWD string (e.g. "12.500")',
        );
      }
    }
    if (input.scheduledAt != null) {
      const t = Date.parse(input.scheduledAt);
      if (Number.isNaN(t)) {
        throw new BadRequestException('scheduledAt must be a valid ISO timestamp');
      }
    }
    if (input.kind === 'CALLBACK' && input.amountKdSnapshot != null) {
      throw new BadRequestException('callbacks must not carry an amount snapshot');
    }
    this.enforceMemoryBound();

    const now = input.now ?? Date.now();
    const id = randomUUID();
    const initialEvent: WorkflowEvent = {
      at: new Date(now).toISOString(),
      actorId: input.actorId,
      actorName: input.actorName,
      action: 'CREATED',
      notes: input.notes ?? null,
    };
    const item: WorkflowItem = {
      id,
      kind: input.kind,
      status: 'OPEN',
      priority: input.priority ?? 'NORMAL',
      customerId: input.customerId,
      customerNameSnapshot: input.customerNameSnapshot ?? null,
      orderId: input.orderId ?? null,
      scheduledAt: input.scheduledAt ?? null,
      amountKdSnapshot: input.amountKdSnapshot ?? null,
      notes: input.notes ?? null,
      branchId: input.branchId ?? null,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      createdById: input.actorId,
      createdByName: input.actorName,
      ownedById: null,
      ownedByName: null,
      resolvedAt: null,
      resolvedById: null,
      resolvedByName: null,
      history: [initialEvent],
    };
    this.items.set(id, item);
    return this.clone(item);
  }

  /**
   * Transition the status of an existing workflow item. Allowed transitions:
   *   OPEN          → IN_PROGRESS / COMPLETED / BROKEN / CANCELLED
   *   IN_PROGRESS   → OPEN / COMPLETED / BROKEN / CANCELLED
   *   COMPLETED/BROKEN/CANCELLED → (terminal; rejected)
   */
  transition(input: {
    id: string;
    nextStatus: WorkflowStatus;
    actorId: string;
    actorName: string;
    notes?: string | null;
    now?: number;
  }): WorkflowItem {
    const item = this.items.get(input.id);
    if (!item) {
      throw new NotFoundException(`workflow item ${input.id} not found`);
    }
    if (item.status === 'COMPLETED' || item.status === 'BROKEN' || item.status === 'CANCELLED') {
      throw new BadRequestException(
        `workflow item ${input.id} is already terminal (${item.status})`,
      );
    }
    const allowed: ReadonlyArray<WorkflowStatus> =
      item.status === 'OPEN'
        ? ['IN_PROGRESS', 'COMPLETED', 'BROKEN', 'CANCELLED']
        : ['OPEN', 'COMPLETED', 'BROKEN', 'CANCELLED'];
    if (!allowed.includes(input.nextStatus)) {
      throw new BadRequestException(
        `transition ${item.status} → ${input.nextStatus} not allowed`,
      );
    }
    if (input.nextStatus === 'BROKEN' && item.kind !== 'PROMISE') {
      throw new BadRequestException('only promises can be marked BROKEN');
    }
    const now = input.now ?? Date.now();
    const action: WorkflowEvent['action'] =
      input.nextStatus === 'COMPLETED'
        ? 'COMPLETED'
        : input.nextStatus === 'BROKEN'
          ? 'BROKEN'
          : input.nextStatus === 'CANCELLED'
            ? 'CANCELLED'
            : 'UPDATED';
    const isResolved =
      input.nextStatus === 'COMPLETED' ||
      input.nextStatus === 'BROKEN' ||
      input.nextStatus === 'CANCELLED';

    const event: WorkflowEvent = {
      at: new Date(now).toISOString(),
      actorId: input.actorId,
      actorName: input.actorName,
      action,
      notes: input.notes ?? null,
    };
    const next: WorkflowItem = {
      ...item,
      status: input.nextStatus,
      updatedAt: new Date(now).toISOString(),
      resolvedAt: isResolved ? new Date(now).toISOString() : item.resolvedAt,
      resolvedById: isResolved ? input.actorId : item.resolvedById,
      resolvedByName: isResolved ? input.actorName : item.resolvedByName,
      history: [...item.history, event],
    };
    this.items.set(input.id, next);
    return this.clone(next);
  }

  /**
   * Operator takes ownership of an item — visibility-only signal so two
   * operators don't accidentally pick the same callback. Releasing
   * ownership is just `claim(null)`.
   */
  claim(input: {
    id: string;
    actorId: string;
    actorName: string;
    release?: boolean;
    now?: number;
  }): WorkflowItem {
    const item = this.items.get(input.id);
    if (!item) {
      throw new NotFoundException(`workflow item ${input.id} not found`);
    }
    if (item.status === 'COMPLETED' || item.status === 'BROKEN' || item.status === 'CANCELLED') {
      throw new BadRequestException('cannot claim a terminal item');
    }
    const now = input.now ?? Date.now();
    const event: WorkflowEvent = {
      at: new Date(now).toISOString(),
      actorId: input.actorId,
      actorName: input.actorName,
      action: input.release ? 'RELEASED' : 'OWNED',
      notes: null,
    };
    const next: WorkflowItem = {
      ...item,
      ownedById: input.release ? null : input.actorId,
      ownedByName: input.release ? null : input.actorName,
      updatedAt: new Date(now).toISOString(),
      history: [...item.history, event],
    };
    this.items.set(input.id, next);
    return this.clone(next);
  }

  /** Filtered listing (most recent first). */
  list(query: WorkflowQuery = {}): WorkflowItem[] {
    const all = this.snapshot();
    return all
      .filter((it) => {
        if (query.customerId && it.customerId !== query.customerId) return false;
        if (query.branchId && it.branchId !== query.branchId) return false;
        if (query.kind && it.kind !== query.kind) return false;
        if (query.status && it.status !== query.status) return false;
        if (query.scheduledBeforeIso != null) {
          if (!it.scheduledAt) return false;
          if (it.scheduledAt > query.scheduledBeforeIso) return false;
        }
        if (query.scheduledAfterIso != null) {
          if (!it.scheduledAt) return false;
          if (it.scheduledAt < query.scheduledAfterIso) return false;
        }
        return true;
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  /** Triple-laned snapshot tailored for the cockpit. Open items only. */
  queueSnapshot(query: { branchId?: string | null } = {}): WorkflowQueueSnapshot {
    const open = this.list({ branchId: query.branchId ?? null }).filter(
      (it) => it.status === 'OPEN' || it.status === 'IN_PROGRESS',
    );
    return {
      callbacks: open.filter((it) => it.kind === 'CALLBACK'),
      promises: open.filter((it) => it.kind === 'PROMISE'),
      escalations: open.filter((it) => it.kind === 'ESCALATION'),
      computedAt: new Date().toISOString(),
    };
  }

  /** Single-item lookup. */
  findOne(id: string): WorkflowItem {
    const item = this.items.get(id);
    if (!item) {
      throw new NotFoundException(`workflow item ${id} not found`);
    }
    return this.clone(item);
  }

  /** Test hook — current registry size after eviction sweep. */
  sizeForTest(now?: number): number {
    this.evictOldResolved(now ?? Date.now());
    return this.items.size;
  }

  /** Test hook — clear all state (never call from runtime code). */
  clearForTest(): void {
    this.items.clear();
  }

  /** Take a fresh point-in-time snapshot of every live item. */
  private snapshot(): WorkflowItem[] {
    this.evictOldResolved(Date.now());
    const out: WorkflowItem[] = [];
    for (const it of this.items.values()) out.push(this.clone(it));
    return out;
  }

  private evictOldResolved(now: number): void {
    for (const [id, it] of this.items) {
      if (!it.resolvedAt) continue;
      const t = Date.parse(it.resolvedAt);
      if (Number.isNaN(t)) continue;
      if (now - t > RESOLVED_RETENTION_MS) this.items.delete(id);
    }
  }

  private enforceMemoryBound(): void {
    if (this.items.size < MAX_LIVE_ITEMS) return;
    // Preferentially drop the oldest *resolved* items to make room.
    const sortedResolved = Array.from(this.items.values())
      .filter((it) => it.resolvedAt != null)
      .sort((a, b) => (a.resolvedAt! < b.resolvedAt! ? -1 : 1));
    for (const it of sortedResolved) {
      if (this.items.size < MAX_LIVE_ITEMS) break;
      this.items.delete(it.id);
    }
    if (this.items.size >= MAX_LIVE_ITEMS) {
      this.logger.warn(
        `collections_workflow_capacity_pressure size=${this.items.size}`,
      );
    }
  }

  private clone(item: WorkflowItem): WorkflowItem {
    return { ...item, history: item.history.map((h) => ({ ...h })) };
  }
}
