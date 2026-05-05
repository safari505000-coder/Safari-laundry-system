import { createHash } from 'node:crypto';

/** Deterministic idempotency key for BullMQ (worker-safe across replay). */
export function bullmqStableJobId(event: string, orderId?: string | null): string {
  const h = createHash('sha256');
  h.update(String(event));
  h.update('\x1e');
  h.update(orderId ? String(orderId).trim() : '');
  return `h${h.digest('hex').slice(0, 40)}`;
}

export function bullmqStableJobIdFromPayload(
  event: string,
  payload: Record<string, unknown>,
): string {
  const oid = payload.orderId;
  if (typeof oid === 'string' && oid.length >= 8) {
    return bullmqStableJobId(event, oid);
  }
  const h = createHash('sha256');
  h.update(event);
  h.update(JSON.stringify(payload, Object.keys(payload).sort()));
  return `h${h.digest('hex').slice(0, 40)}`;
}
