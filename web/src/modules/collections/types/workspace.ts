/**
 * V20.6 — Phase 7 Collections Operations Workspace types.
 *
 * The DTO shapes the workspace consumes. Wherever possible we reuse
 * the existing server-canonical Customer 360 shape so the workspace
 * never has to reach for a new API surface to mount. Promise / note
 * shapes are minimal and forward-compatible with the V20.5
 * PromisesToPay + CollectionsAccount models.
 */

export type WorkspacePromise = {
  id: string;
  status: 'ACTIVE' | 'KEPT' | 'BROKEN' | 'CANCELLED';
  amountKd: string;
  promisedDate: string;
  createdAt: string;
};

export type WorkspaceNote = {
  id: string;
  authorName: string;
  bodyMd: string;
  createdAt: string;
};

export type WorkspaceTimelineRow = {
  id: string;
  kind:
    | 'INVOICE_ISSUED'
    | 'PAYMENT_CAPTURED'
    | 'PARTIAL_PAYMENT_CAPTURED'
    | 'INVOICE_REVERSED'
    | 'REFUND_CREATED'
    | 'WALLET_ADJUSTED'
    | 'PROMISE_CREATED'
    | 'PROMISE_KEPT'
    | 'PROMISE_BROKEN'
    | 'COLLECTION_ESCALATED'
    | 'FRAUD_ALERT'
    | 'NOTE'
    | 'OTHER';
  occurredAt: string;
  title: string;
  description?: string | null;
  amountKd?: string | null;
  reference?: string | null;
  actorName?: string | null;
};
