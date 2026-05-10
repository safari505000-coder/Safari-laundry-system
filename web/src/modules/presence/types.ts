/**
 * V23 Phase 6 — Operator Presence types (frontend mirror of backend DTOs).
 *
 * All shapes are visibility-only. No financial fields, no money math.
 */

export type PresenceScopeKind =
  | 'customer'
  | 'collection-row'
  | 'reconciliation-row'
  | 'order';

export interface PresenceHeartbeat {
  userId: string;
  username: string;
  fullName: string | null;
  safariRole: string;
  branchId: string | null;
  scopeKind: PresenceScopeKind;
  scopeId: string;
  /** ISO timestamp of the most recent heartbeat acceptance. */
  lastSeenAt: string;
}

export interface PresenceListResponse {
  operators: PresenceHeartbeat[];
  computedAt: string;
}
