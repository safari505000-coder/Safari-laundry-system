/**
 * V20.9 — Phase 2 Realtime channel + envelope contract.
 *
 * The {@link FinancialRealtimeGateway} fans out
 * {@link FinancialDomainEvent}s to per-channel SSE feeds. Each
 * channel has:
 *
 *   • `id` — short stable identifier used in URLs + clients
 *   • `requiredRoles` — server-side role gate (cross-checked in
 *     the controller before subscription)
 *   • `match(envelope)` — returns whether a given event belongs
 *     to this channel
 *
 * Channels are intentionally code-driven (not DB-driven) so the
 * compile-time role gate is verifiable in tests.
 */
import type {
  FinancialDomainEvent,
  FinancialDomainEventName,
} from '../financial-domain-event.types';

export const REALTIME_HEARTBEAT_MS = 15_000;

export type RealtimeRole =
  | 'OWNER'
  | 'GENERAL_MANAGER'
  | 'MANAGER'
  | 'ACCOUNTANT'
  | 'CALL_CENTER'
  | 'CALL_CENTER_SUPERVISOR';

export type RealtimeChannelId =
  | 'collections'
  | 'customer360'
  | 'dashboards'
  | 'fraud'
  | 'reconciliation'
  | 'risk'
  | 'branch-accounting';

export type RealtimeFanoutEnvelope = {
  channel: RealtimeChannelId;
  eventName: FinancialDomainEventName;
  /** Customer scope for client-side filtering (`customerId`). */
  customerId: string | null;
  /** Branch scope for branch-aware feeds. */
  branchId: string | null;
  /** Server-canonical timestamp. */
  at: string;
  /** Original event payload — verbatim, no client math required. */
  payload: unknown;
};

export type RealtimeChannel = {
  id: RealtimeChannelId;
  requiredRoles: ReadonlyArray<RealtimeRole>;
  /** True if this event should fan out on this channel. */
  match(event: FinancialDomainEvent): boolean;
};

const COLLECTOR_ROLES: ReadonlyArray<RealtimeRole> = [
  'OWNER',
  'GENERAL_MANAGER',
  'MANAGER',
  'ACCOUNTANT',
  'CALL_CENTER',
  'CALL_CENTER_SUPERVISOR',
];

const ACCOUNTING_ROLES: ReadonlyArray<RealtimeRole> = [
  'OWNER',
  'GENERAL_MANAGER',
  'MANAGER',
  'ACCOUNTANT',
];

const SUPERVISOR_ROLES: ReadonlyArray<RealtimeRole> = [
  'OWNER',
  'GENERAL_MANAGER',
  'MANAGER',
  'CALL_CENTER_SUPERVISOR',
];

export const REALTIME_CHANNELS: ReadonlyArray<RealtimeChannel> = [
  {
    id: 'collections',
    requiredRoles: COLLECTOR_ROLES,
    match: (e) =>
      e.name === 'finance.collection.escalated' ||
      e.name === 'finance.collection.stage.changed' ||
      e.name === 'finance.invoice.overdue' ||
      e.name === 'finance.promise.created' ||
      e.name === 'finance.promise.broken' ||
      e.name === 'finance.promise.kept',
  },
  {
    id: 'customer360',
    requiredRoles: COLLECTOR_ROLES,
    // Customer 360 cares about every customer-scoped event.
    match: (e) => Boolean((e.payload as { customerId?: string }).customerId),
  },
  {
    id: 'dashboards',
    requiredRoles: ACCOUNTING_ROLES,
    match: (e) =>
      e.name === 'finance.payment.captured' ||
      e.name === 'finance.payment.partial' ||
      e.name === 'finance.invoice.issued' ||
      e.name === 'finance.snapshot.refreshed' ||
      e.name === 'finance.collection.escalated',
  },
  {
    id: 'fraud',
    requiredRoles: SUPERVISOR_ROLES,
    match: (e) => e.name === 'finance.fraud.alert.created',
  },
  {
    id: 'reconciliation',
    requiredRoles: ACCOUNTING_ROLES,
    match: (e) => e.name === 'finance.reconciliation.failed',
  },
  {
    id: 'risk',
    requiredRoles: COLLECTOR_ROLES,
    match: (e) => e.name === 'finance.risk.recalculated',
  },
  {
    id: 'branch-accounting',
    requiredRoles: ACCOUNTING_ROLES,
    match: (e) =>
      e.name === 'finance.payment.captured' ||
      e.name === 'finance.refund.created' ||
      e.name === 'finance.wallet.adjusted',
  },
];

export function channelById(id: RealtimeChannelId): RealtimeChannel | undefined {
  return REALTIME_CHANNELS.find((c) => c.id === id);
}

export function channelsForEvent(
  event: FinancialDomainEvent,
): RealtimeChannel[] {
  return REALTIME_CHANNELS.filter((c) => c.match(event));
}

export function isRoleAllowed(
  role: RealtimeRole | string,
  channel: RealtimeChannel,
): boolean {
  return channel.requiredRoles.includes(role as RealtimeRole);
}
