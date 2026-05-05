/**
 * V19.x — Internal event names for the dispatch module.
 *
 * STRICT contract:
 *   - These are emitted via `EventEmitter2` (no DB write inside the
 *     emitter; the listener is responsible for any persistence).
 *   - Names use dot.case to play well with the EventEmitter2 wildcard
 *     matcher.
 *   - The payloads are SMALL JSON-safe objects — never a Prisma row,
 *     never a Decimal, never a Date object (use ISO strings).
 *
 * Why constants and not magic strings: every emit + every listener
 * decorator has to spell the same name. Centralising them stops a
 * silent mismatch from killing a workflow (the listener simply never
 * fires, with no error) and gives Prettier / TS-rename a single place
 * to refactor.
 */

/**
 * Fired exactly once when a new Order row is committed. Payload tells
 * the dispatch listener which dispatch to close (if any). The order
 * service itself stays single-purpose — it has no awareness of
 * dispatches beyond this one emit line.
 */
export const ORDER_CREATED_EVENT = 'order.created' as const;

export type OrderCreatedEventPayload = {
  /** Order PK (UUID). */
  orderId: string;
  /**
   * Optional dispatch foreign key carried on the Order row. When
   * present (and the dispatch is still ASSIGNED), the listener stamps
   * `Dispatch.completedAt = NOW()`, `status = COMPLETED`,
   * `completedByOrderId = orderId`. When null/undefined the listener
   * is a no-op.
   */
  dispatchId: string | null;
  /** Audit attribution — usually the driver who closed the order. */
  actorUserId: string | null;
  /** ISO 8601 timestamp from the order row's createdAt for traceability. */
  occurredAtIso: string;
};

/**
 * Fired by `DispatchService.create` so the SSE driver-stream gateway
 * can push the new instruction to the assigned driver in real time.
 * Carries only display-safe primitives (no PII beyond the fields
 * already exposed by the dispatch list endpoint).
 */
export const DISPATCH_CREATED_EVENT = 'dispatch.created' as const;

/**
 * Fired by `DispatchService.handleOrderCreated` after a dispatch is
 * marked COMPLETED so the SSE stream can let the driver UI clear the
 * card and the call-center dashboard can refresh its "Active" list.
 */
export const DISPATCH_COMPLETED_EVENT = 'dispatch.completed' as const;

export type DispatchStreamEventPayload = {
  dispatchId: string;
  driverId: string;
  customerId: string;
  status: 'ASSIGNED' | 'COMPLETED';
  createdAtIso: string;
  completedAtIso: string | null;
};
