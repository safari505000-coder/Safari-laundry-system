import {
  PRESENCE_STALE_AFTER_MS,
  PresenceService,
  type PresenceScopeKind,
} from './presence.service';

const beat = (
  service: PresenceService,
  partial: Partial<{
    userId: string;
    username: string;
    fullName: string | null;
    safariRole: string;
    branchId: string | null;
    scopeKind: PresenceScopeKind;
    scopeId: string;
    now: number;
  }> = {},
) => {
  return service.recordHeartbeat({
    userId: partial.userId ?? 'user-a',
    username: partial.username ?? 'agent.a',
    fullName: partial.fullName ?? 'Agent A',
    safariRole: partial.safariRole ?? 'CALL_CENTER',
    branchId: partial.branchId ?? 'br-1',
    scopeKind: partial.scopeKind ?? 'customer',
    scopeId: partial.scopeId ?? 'cust-1',
    now: partial.now,
  });
};

describe('PresenceService (V23 Phase 6)', () => {
  let service: PresenceService;

  beforeEach(() => {
    service = new PresenceService();
  });

  afterEach(() => {
    service.stopForTest();
  });

  it('records a heartbeat and surfaces it on the matching scope', () => {
    beat(service, { userId: 'u1', username: 'one', scopeId: 'cust-1' });
    const snap = service.getCustomerPresence('cust-1');
    expect(snap).toHaveLength(1);
    expect(snap[0]).toMatchObject({
      userId: 'u1',
      username: 'one',
      scopeKind: 'customer',
      scopeId: 'cust-1',
    });
  });

  it('treats heartbeats older than the TTL as stale', () => {
    const t0 = Date.UTC(2026, 0, 1, 12, 0, 0);
    beat(service, { userId: 'u1', scopeId: 'cust-1', now: t0 });

    const stillFresh = service.getCustomerPresence('cust-1', {
      now: t0 + PRESENCE_STALE_AFTER_MS - 1,
    });
    expect(stillFresh).toHaveLength(1);

    const expired = service.getCustomerPresence('cust-1', {
      now: t0 + PRESENCE_STALE_AFTER_MS + 1,
    });
    expect(expired).toHaveLength(0);
  });

  it('refreshing a heartbeat extends its TTL in place (no duplicates)', () => {
    const t0 = Date.UTC(2026, 0, 1, 12, 0, 0);
    beat(service, { userId: 'u1', scopeId: 'cust-1', now: t0 });
    beat(service, {
      userId: 'u1',
      scopeId: 'cust-1',
      now: t0 + PRESENCE_STALE_AFTER_MS - 5,
    });

    const snap = service.getCustomerPresence('cust-1', {
      now: t0 + PRESENCE_STALE_AFTER_MS - 4,
    });
    expect(snap).toHaveLength(1);
    expect(snap[0].lastSeenAt).toBe(
      new Date(t0 + PRESENCE_STALE_AFTER_MS - 5).toISOString(),
    );
  });

  it('co-viewers are sorted oldest-seen-first for stable rendering', () => {
    const t0 = Date.UTC(2026, 0, 1, 12, 0, 0);
    beat(service, { userId: 'u1', username: 'first', scopeId: 'cust-1', now: t0 });
    beat(service, {
      userId: 'u2',
      username: 'second',
      scopeId: 'cust-1',
      now: t0 + 100,
    });
    beat(service, {
      userId: 'u3',
      username: 'third',
      scopeId: 'cust-1',
      now: t0 + 50,
    });

    const snap = service.getCustomerPresence('cust-1', { now: t0 + 200 });
    expect(snap.map((s) => s.userId)).toEqual(['u1', 'u3', 'u2']);
  });

  it('release() removes the entry immediately', () => {
    beat(service, { userId: 'u1', scopeId: 'cust-1' });
    service.release({ userId: 'u1', scopeKind: 'customer', scopeId: 'cust-1' });
    expect(service.getCustomerPresence('cust-1')).toHaveLength(0);
  });

  it('getActiveOperators dedupes a single user across multiple scopes', () => {
    const t0 = Date.UTC(2026, 0, 1, 12, 0, 0);
    beat(service, {
      userId: 'u1',
      username: 'one',
      scopeKind: 'customer',
      scopeId: 'cust-1',
      now: t0,
    });
    beat(service, {
      userId: 'u1',
      username: 'one',
      scopeKind: 'customer',
      scopeId: 'cust-2',
      now: t0 + 10,
    });
    beat(service, {
      userId: 'u2',
      username: 'two',
      scopeKind: 'order',
      scopeId: 'ord-9',
      now: t0 + 20,
    });

    const active = service.getActiveOperators({ now: t0 + 100 });
    expect(active.map((o) => o.userId).sort()).toEqual(['u1', 'u2']);
  });

  it('getActiveOperators respects a branch filter when provided', () => {
    const t0 = Date.UTC(2026, 0, 1, 12, 0, 0);
    beat(service, { userId: 'u1', branchId: 'br-1', scopeId: 'cust-1', now: t0 });
    beat(service, { userId: 'u2', branchId: 'br-2', scopeId: 'cust-2', now: t0 });

    const branch1 = service.getActiveOperators({ branchId: 'br-1', now: t0 + 100 });
    expect(branch1).toHaveLength(1);
    expect(branch1[0].userId).toBe('u1');
  });

  it('sweep evicts stale entries and bounds memory growth', () => {
    const t0 = Date.UTC(2026, 0, 1, 12, 0, 0);
    for (let i = 0; i < 50; i += 1) {
      beat(service, {
        userId: `u${i}`,
        scopeId: `cust-${i}`,
        now: t0,
      });
    }
    expect(service.sizeForTest(t0 + 100)).toBe(50);
    // After the TTL, a swept query should report zero.
    expect(service.sizeForTest(t0 + PRESENCE_STALE_AFTER_MS + 1000)).toBe(0);
  });

  it('records ALL canonical scope kinds without behavioural drift', () => {
    const kinds: PresenceScopeKind[] = [
      'customer',
      'collection-row',
      'reconciliation-row',
      'order',
    ];
    kinds.forEach((scopeKind, idx) => {
      service.recordHeartbeat({
        userId: `u-${idx}`,
        username: `agent-${idx}`,
        safariRole: 'CALL_CENTER',
        branchId: 'br-1',
        scopeKind,
        scopeId: `scope-${idx}`,
      });
      const snap = service.scopeSnapshot(scopeKind, `scope-${idx}`);
      expect(snap).toHaveLength(1);
      expect(snap[0].scopeKind).toBe(scopeKind);
    });
  });
});
