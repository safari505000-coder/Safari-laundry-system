/**
 * V23 Phase 6 — Workflow Intelligence module barrel.
 *
 * Single import surface for the visibility-only operator-assistance
 * primitives. All consumers MUST import from here so internals can
 * be reorganized without touching downstream pages.
 *
 * Strict invariants (enforced by the lock-in tests):
 *   • No money math.
 *   • No autonomous decisions.
 *   • No API calls.
 */
export {
  classifyAging,
  classifyCallbackUrgency,
  classifyQueueHealth,
  daysBetween,
  groupByAgingBucket,
  type AgingBucket,
  type AgingClassification,
  type CallbackUrgency,
  type CallbackUrgencyClassification,
  type QueueHealthInput,
  type QueueHealthLevel,
  type QueueHealthClassification,
} from './workflow-intelligence';
export { AgingBadge, type AgingBadgeProps } from './AgingBadge';
export { QueueHealthBadge, type QueueHealthBadgeProps } from './QueueHealthBadge';
