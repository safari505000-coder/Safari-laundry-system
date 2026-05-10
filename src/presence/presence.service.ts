import { Injectable, Logger } from '@nestjs/common';

/**
 * V23 Phase 6 — Operator Presence Service.
 *
 * In-process, TTL-based registry of "who is currently looking at what".
 * Every authenticated operator can ping `recordHeartbeat()` to assert
 * they are still active on a given scope (a customer-360 session, a
 * collections row, a reconciliation row, …). Anyone else can read
 * `getCustomerPresence()` to know which colleagues are concurrently
 * viewing or working on the same record.
 *
 * STRICT INVARIANTS — read these before adding any feature:
 *   1. Visibility-only. Presence is a UI hint, never a lock. Two
 *      operators may concurrently mutate the same record; the
 *      database remains the single source of truth.
 *   2. Append-only-friendly. No financial value flows through this
 *      service. Heartbeats are just `{ userId, scope, expiresAt }`
 *      tuples in an in-memory `Map`. Nothing here can corrupt the
 *      ledger or the journal.
 *   3. Bounded. A periodic sweep evicts entries older than
 *      `STALE_AFTER_MS` so the map never grows without bound, even
 *      under malicious heartbeat spam.
 *   4. Cluster-safe surface. Today this lives in-process; a future
 *      Redis-backed implementation can replace the `Map` without
 *      changing the public API.
 *
 * The service is deliberately small (≈100 LOC) and dependency-free
 * so it can be unit-tested with hand-rolled fixtures and zero DB.
 */

export type PresenceScopeKind =
  | 'customer'
  | 'collection-row'
  | 'reconciliation-row'
  | 'order';

export type PresenceHeartbeat = {
  userId: string;
  username: string;
  fullName: string | null;
  safariRole: string;
  branchId: string | null;
  scopeKind: PresenceScopeKind;
  scopeId: string;
  /** ISO timestamp when this heartbeat was last refreshed. */
  lastSeenAt: string;
};

type InternalEntry = PresenceHeartbeat & { expiresAt: number };

/**
 * Heartbeats older than this are considered stale (the operator
 * either closed the tab, lost connection, or moved on). The
 * default matches the 15s SSE heartbeat used by the V20.9 realtime
 * gateway, so a single missed beat does not flap presence.
 */
export const PRESENCE_STALE_AFTER_MS = 45_000;

/** How often the in-memory sweep runs to evict stale entries. */
const PRESENCE_SWEEP_INTERVAL_MS = 30_000;

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  // Keyed by `${scopeKind}:${scopeId}:${userId}` so a single user can
  // appear at most once per scope, but may legitimately be present on
  // several scopes concurrently (e.g. dashboard + a customer they're
  // currently helping).
  private readonly entries = new Map<string, InternalEntry>();

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startSweep();
  }

  /**
   * Record (or refresh) a heartbeat. Returns the canonical
   * heartbeat shape so the caller can echo it back to the client.
   */
  recordHeartbeat(input: {
    userId: string;
    username: string;
    fullName?: string | null;
    safariRole: string;
    branchId?: string | null;
    scopeKind: PresenceScopeKind;
    scopeId: string;
    now?: number;
  }): PresenceHeartbeat {
    const now = input.now ?? Date.now();
    const heartbeat: InternalEntry = {
      userId: input.userId,
      username: input.username,
      fullName: input.fullName ?? null,
      safariRole: input.safariRole,
      branchId: input.branchId ?? null,
      scopeKind: input.scopeKind,
      scopeId: input.scopeId,
      lastSeenAt: new Date(now).toISOString(),
      expiresAt: now + PRESENCE_STALE_AFTER_MS,
    };
    this.entries.set(this.keyFor(input.scopeKind, input.scopeId, input.userId), heartbeat);
    return this.toPublic(heartbeat);
  }

  /**
   * Explicit release (operator navigated away). Best-effort —
   * presence is a soft hint, callers do not have to invoke this.
   */
  release(input: {
    userId: string;
    scopeKind: PresenceScopeKind;
    scopeId: string;
  }): void {
    this.entries.delete(this.keyFor(input.scopeKind, input.scopeId, input.userId));
  }

  /**
   * All currently-live operators on a single customer-360 session.
   * Used by the customer-360 ribbon to render co-viewer badges.
   */
  getCustomerPresence(customerId: string, opts?: { now?: number }): PresenceHeartbeat[] {
    return this.scopeSnapshot('customer', customerId, opts);
  }

  /** Generic scope query, exposed for collections / reconciliation rows. */
  scopeSnapshot(
    scopeKind: PresenceScopeKind,
    scopeId: string,
    opts?: { now?: number },
  ): PresenceHeartbeat[] {
    const now = opts?.now ?? Date.now();
    const out: PresenceHeartbeat[] = [];
    for (const entry of this.entries.values()) {
      if (entry.scopeKind !== scopeKind || entry.scopeId !== scopeId) continue;
      if (entry.expiresAt <= now) continue;
      out.push(this.toPublic(entry));
    }
    out.sort((a, b) => a.lastSeenAt.localeCompare(b.lastSeenAt));
    return out;
  }

  /**
   * Operators whose latest heartbeat fell within the live window.
   * Optionally scope to a single branch for branch-aware shells.
   */
  getActiveOperators(opts?: { branchId?: string | null; now?: number }): PresenceHeartbeat[] {
    const now = opts?.now ?? Date.now();
    const seen = new Map<string, InternalEntry>();
    for (const entry of this.entries.values()) {
      if (entry.expiresAt <= now) continue;
      if (opts?.branchId !== undefined && opts.branchId !== null) {
        if (entry.branchId !== opts.branchId) continue;
      }
      const prev = seen.get(entry.userId);
      if (!prev || prev.expiresAt < entry.expiresAt) {
        seen.set(entry.userId, entry);
      }
    }
    return Array.from(seen.values())
      .map((e) => this.toPublic(e))
      .sort((a, b) => a.username.localeCompare(b.username));
  }

  /** Test hook — returns the raw map size after sweeping stale entries. */
  sizeForTest(now?: number): number {
    this.sweep(now ?? Date.now());
    return this.entries.size;
  }

  /** Test hook — stops the periodic sweep so tests don't leak timers. */
  stopForTest(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private startSweep(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      try {
        this.sweep(Date.now());
      } catch (err) {
        this.logger.warn(`presence_sweep_failed ${(err as Error).message}`);
      }
    }, PRESENCE_SWEEP_INTERVAL_MS);
    // Allow the Node process to exit even if presence is the only
    // thing keeping the loop alive (matches NestJS test-runner expectations).
    if (typeof (this.timer as { unref?: () => void }).unref === 'function') {
      (this.timer as { unref: () => void }).unref();
    }
  }

  private sweep(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  private keyFor(scopeKind: PresenceScopeKind, scopeId: string, userId: string): string {
    return `${scopeKind}:${scopeId}:${userId}`;
  }

  private toPublic(entry: InternalEntry): PresenceHeartbeat {
    return {
      userId: entry.userId,
      username: entry.username,
      fullName: entry.fullName,
      safariRole: entry.safariRole,
      branchId: entry.branchId,
      scopeKind: entry.scopeKind,
      scopeId: entry.scopeId,
      lastSeenAt: entry.lastSeenAt,
    };
  }
}
