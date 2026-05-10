/**
 * V23.1 Phase 7 — Collections Operational Workflow types.
 *
 * Visibility-only operational state for the Collections cockpit.
 *
 * STRICT INVARIANTS — must be preserved by any future contributor:
 *   1. NO authoritative money is stored here. The `amountKd` field
 *      on a promise is a SNAPSHOT label captured at the moment the
 *      operator entered the promise; it is never used in any
 *      financial calculation. The canonical settlement amount is
 *      determined by the canonical payment service when (and if)
 *      the customer pays.
 *   2. Operations never mutate canonical financial state. Marking
 *      a promise as "kept" is a workflow status change, not a debt
 *      adjustment. The actual payment that satisfies the promise
 *      goes through the standard payment flow.
 *   3. Append-only-friendly. Items are never hard-deleted; status
 *      transitions always create a new audit trail entry.
 */

export type WorkflowKind = 'CALLBACK' | 'PROMISE' | 'ESCALATION';

export type WorkflowStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'BROKEN' // promise was missed
  | 'CANCELLED';

export type WorkflowPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface WorkflowItem {
  id: string;
  kind: WorkflowKind;
  status: WorkflowStatus;
  priority: WorkflowPriority;
  customerId: string;
  customerNameSnapshot: string | null;
  /** Optional invoice scope; useful for promises tied to a specific order. */
  orderId: string | null;
  /** ISO timestamp the item is scheduled for (callback time, promise due, escalation deadline). */
  scheduledAt: string | null;
  /**
   * Promise/escalation amount snapshot — purely a label for the operator.
   * Stored as a canonical KWD string ("12.500"), NEVER used in any math.
   * Null for callbacks.
   */
  amountKdSnapshot: string | null;
  notes: string | null;
  branchId: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  createdByName: string;
  /** Operator currently owning this item (for ownership/handoff). */
  ownedById: string | null;
  ownedByName: string | null;
  resolvedAt: string | null;
  resolvedById: string | null;
  resolvedByName: string | null;
  /** Audit trail of status transitions (append-only). */
  history: ReadonlyArray<WorkflowEvent>;
}

export interface WorkflowEvent {
  at: string;
  actorId: string;
  actorName: string;
  action: 'CREATED' | 'UPDATED' | 'OWNED' | 'RELEASED' | 'COMPLETED' | 'BROKEN' | 'CANCELLED';
  notes: string | null;
}

export interface WorkflowQuery {
  customerId?: string | null;
  branchId?: string | null;
  kind?: WorkflowKind | null;
  status?: WorkflowStatus | null;
  /** ISO upper bound for `scheduledAt`. Useful for "due today" filters. */
  scheduledBeforeIso?: string | null;
  /** ISO lower bound for `scheduledAt`. Useful for "scheduled from now on". */
  scheduledAfterIso?: string | null;
}

export interface WorkflowQueueSnapshot {
  callbacks: ReadonlyArray<WorkflowItem>;
  promises: ReadonlyArray<WorkflowItem>;
  escalations: ReadonlyArray<WorkflowItem>;
  computedAt: string;
}
