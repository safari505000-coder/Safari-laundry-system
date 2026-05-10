/**
 * V23.1 Phase 7 — Collections Operational Workflow types (frontend mirror).
 *
 * STRICT INVARIANTS — must be preserved by any frontend consumer:
 *   • `amountKdSnapshot` is a display-only string label. NEVER parse it
 *     into a number; NEVER feed it into any arithmetic. Render it
 *     verbatim with `formatKwdLabel()` if a label is required.
 *   • Workflow items are visibility-only operational state — they do
 *     NOT represent canonical financial obligations. The actual money
 *     side of a promise is owned by the canonical payment service.
 */

export type WorkflowKind = 'CALLBACK' | 'PROMISE' | 'ESCALATION';

export type WorkflowStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'BROKEN'
  | 'CANCELLED';

export type WorkflowPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface WorkflowEvent {
  at: string;
  actorId: string;
  actorName: string;
  action: 'CREATED' | 'UPDATED' | 'OWNED' | 'RELEASED' | 'COMPLETED' | 'BROKEN' | 'CANCELLED';
  notes: string | null;
}

export interface WorkflowItem {
  id: string;
  kind: WorkflowKind;
  status: WorkflowStatus;
  priority: WorkflowPriority;
  customerId: string;
  customerNameSnapshot: string | null;
  orderId: string | null;
  scheduledAt: string | null;
  amountKdSnapshot: string | null;
  notes: string | null;
  branchId: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  createdByName: string;
  ownedById: string | null;
  ownedByName: string | null;
  resolvedAt: string | null;
  resolvedById: string | null;
  resolvedByName: string | null;
  history: WorkflowEvent[];
}

export interface WorkflowQueueSnapshot {
  callbacks: WorkflowItem[];
  promises: WorkflowItem[];
  escalations: WorkflowItem[];
  computedAt: string;
}

export interface CreateWorkflowItemInput {
  kind: WorkflowKind;
  customerId: string;
  customerNameSnapshot?: string;
  orderId?: string;
  scheduledAt?: string;
  amountKdSnapshot?: string;
  priority?: WorkflowPriority;
  notes?: string;
  branchId?: string;
}
