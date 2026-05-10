/**
 * V23 Phase 6 — Operator Presence module barrel.
 *
 * Single import surface for the visibility-only presence
 * primitives. Consumers MUST import from here so the internals can
 * be reorganized without rippling across the app.
 */
export { useOperatorPresence } from './use-operator-presence';
export type { UseOperatorPresenceResult } from './use-operator-presence';
export { PresenceRibbon } from './PresenceRibbon';
export type { PresenceRibbonProps } from './PresenceRibbon';
export {
  deletePresenceHeartbeat,
  getActiveOperators,
  getCustomerCoviewers,
  postPresenceHeartbeat,
} from './presence-api';
export type {
  PresenceHeartbeat,
  PresenceListResponse,
  PresenceScopeKind,
} from './types';
