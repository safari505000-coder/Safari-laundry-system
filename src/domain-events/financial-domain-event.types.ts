/**
 * V20.4 — Phase 5 typed domain-event surface.
 *
 * The bus is `@nestjs/event-emitter` (already configured at the
 * AppModule level). This module provides the typed envelope and
 * a tiny publisher so producers and consumers share one symbol
 * table. Adding a new event MUST go through this file:
 *
 *   1. Add the literal to {@link FinancialDomainEventName}.
 *   2. Add its payload to {@link FinancialDomainEventPayloadByName}.
 *   3. (Optional) extend {@link FinancialDomainEvent} consumers in
 *      `domain-events/handlers/` to react to the new event.
 *
 * Naming convention is `noun.past-tense` so wildcard subscribers
 * (`finance.*`) can fan out without having to enumerate types.
 */
export const FINANCIAL_DOMAIN_EVENT_PREFIX = 'finance';

export type FinancialDomainEventName =
  | 'finance.invoice.issued'
  | 'finance.invoice.reversed'   // V20.6 — Phase 4
  | 'finance.payment.captured'
  | 'finance.payment.partial'
  | 'finance.wallet.absorbed'
  | 'finance.wallet.adjusted'    // V20.6 — Phase 4
  | 'finance.refund.created'     // V20.6 — Phase 4
  | 'finance.subscription.activated'
  | 'finance.subscription.expired'
  | 'finance.collection.escalated'
  | 'finance.invoice.overdue'
  | 'finance.promise.created'    // V20.6 — Phase 4
  | 'finance.promise.broken'     // V20.6 — Phase 4
  | 'finance.promise.kept'       // V20.6 — Phase 4
  | 'finance.fraud.alert.created'// V20.6 — Phase 4
  | 'finance.snapshot.refreshed' // V20.6 — Phase 4
  | 'finance.risk.recalculated'  // V20.6 — Phase 4
  | 'finance.collection.stage.changed' // V20.9 — Phase 1
  | 'finance.reconciliation.failed';   // V20.9 — Phase 1

export type CustomerScopedPayload = {
  /** Customer the event affects — primary projector key. */
  customerId: string;
  /** Optional order/invoice id for projection refresh granularity. */
  orderId?: string | null;
  /** Caller-supplied correlation id (txnHistory.id, payment id, …). */
  correlationId?: string | null;
  /** ISO-8601 of when the originating write committed. */
  occurredAt: string;
};

export type FinancialDomainEventPayloadByName = {
  'finance.invoice.issued': CustomerScopedPayload & {
    invoiceTotalKd: string;
    posPaymentMethod: string | null;
  };
  'finance.payment.captured': CustomerScopedPayload & {
    amountKd: string;
    paymentMethod: string;
  };
  'finance.payment.partial': CustomerScopedPayload & {
    amountKd: string;
    paymentMethod: string;
  };
  'finance.wallet.absorbed': CustomerScopedPayload & {
    amountKd: string;
  };
  'finance.subscription.activated': CustomerScopedPayload & {
    planId: string;
    expiresAt: string;
  };
  'finance.subscription.expired': CustomerScopedPayload & {
    expiredAt: string;
  };
  'finance.collection.escalated': CustomerScopedPayload & {
    severity: 'reminder' | 'warning' | 'block' | 'legal';
  };
  'finance.invoice.overdue': CustomerScopedPayload & {
    daysOverdue: number;
  };
  // V20.6 — Phase 4 additions
  'finance.invoice.reversed': CustomerScopedPayload & {
    reversedAmountKd: string;
    reason?: string | null;
  };
  'finance.wallet.adjusted': CustomerScopedPayload & {
    deltaKd: string;
    reason?: string | null;
  };
  'finance.refund.created': CustomerScopedPayload & {
    amountKd: string;
    refundType: 'CASH' | 'WALLET' | 'GIFT_REMOVAL';
  };
  'finance.promise.created': CustomerScopedPayload & {
    promiseId: string;
    promisedAmountKd: string;
    promisedDate: string;
  };
  'finance.promise.broken': CustomerScopedPayload & {
    promiseId: string;
    promisedAmountKd: string;
  };
  'finance.promise.kept': CustomerScopedPayload & {
    promiseId: string;
  };
  'finance.fraud.alert.created': CustomerScopedPayload & {
    alertId: string;
    type: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  };
  'finance.snapshot.refreshed': CustomerScopedPayload & {
    refreshSource: string;
  };
  'finance.risk.recalculated': CustomerScopedPayload & {
    score: number;
    level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  };
  // V20.9 — Phase 1 additions
  'finance.collection.stage.changed': CustomerScopedPayload & {
    fromStage: string;
    toStage: string;
    reason?: string | null;
  };
  'finance.reconciliation.failed': CustomerScopedPayload & {
    reconciliationId: string;
    expectedKd: string;
    observedKd: string;
    severity: 'WARN' | 'ERROR' | 'CRITICAL';
  };
};

export type FinancialDomainEvent<
  N extends FinancialDomainEventName = FinancialDomainEventName,
> = {
  name: N;
  payload: FinancialDomainEventPayloadByName[N];
};
