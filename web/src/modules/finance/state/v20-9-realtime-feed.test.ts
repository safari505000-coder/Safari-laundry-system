/**
 * V20.9 — Phase 2 frontend realtime hook contracts.
 *
 *   1. On `finance:event` the cache is invalidated for the
 *      mapped prefixes (broad + customer-scoped variants).
 *   2. The hook does NOT read or apply payload financial values
 *      — every value comes from the canonical refetch. We assert
 *      this by leaving a stale cache value untouched (only the
 *      `fetchedAt=0` invalidation marker changes).
 *   3. Auto-reconnect: when EventSource emits `error`, the hook
 *      schedules a reconnect (counter increments).
 *   4. Disabling tears down the EventSource cleanly.
 */
import { afterEach, describe, expect, test } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import {
  financialCache,
  invalidateFinancial,
  keyOf,
} from './financial-cache';
import { useRealtimeFinancialFeed } from './financial-realtime-feed';

type EsListener = (ev: { data: string }) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private listeners = new Map<string, EsListener[]>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 0);
  }
  addEventListener(type: string, listener: EsListener): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(listener);
    this.listeners.set(type, arr);
  }
  removeEventListener(type: string, listener: EsListener): void {
    const arr = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      arr.filter((l) => l !== listener),
    );
  }
  close(): void {
    this.closed = true;
  }
  /** Test-only — fire a server event. */
  __emit(type: string, data: unknown): void {
    const arr = this.listeners.get(type) ?? [];
    for (const l of arr) l({ data: JSON.stringify(data) });
  }
  /** Test-only — fire an error. */
  __error(): void {
    this.onerror?.();
  }
}

beforeAll(() => {
  (globalThis as unknown as { EventSource: typeof FakeEventSource }).EventSource =
    FakeEventSource;
});

afterEach(() => {
  FakeEventSource.instances = [];
  invalidateFinancial('finance');
  cleanup();
});

describe('V20.9 — realtime feed hook', () => {
  test('1. invalidates broad + customer-scoped prefixes on finance:event', async () => {
    const broadKey = keyOf(['finance:invoices']);
    const scopedKey = keyOf(['finance:invoices', 'cust-A']);
    financialCache.setQueryData(broadKey, { rows: ['cached-broad'] });
    financialCache.setQueryData(scopedKey, { rows: ['cached-scoped'] });
    const broadBefore = financialCache.getEntry(broadKey).fetchedAt;
    const scopedBefore = financialCache.getEntry(scopedKey).fetchedAt;
    expect(broadBefore).toBeGreaterThan(0);
    expect(scopedBefore).toBeGreaterThan(0);

    renderHook(() =>
      useRealtimeFinancialFeed({
        channel: 'customer360',
        customerId: 'cust-A',
        accessToken: 'jwt-test',
      }),
    );

    await new Promise((r) => setTimeout(r, 5));
    const es = FakeEventSource.instances[0];
    expect(es).toBeDefined();
    expect(es.url).toContain('/api/realtime/financial/customer360/stream');
    expect(es.url).toContain('access_token=jwt-test');
    expect(es.url).toContain('customer=cust-A');

    act(() => {
      es.__emit('finance:event', {
        channel: 'customer360',
        eventName: 'finance.invoice.issued',
        customerId: 'cust-A',
        branchId: null,
        at: new Date().toISOString(),
        payload: {
          customerId: 'cust-A',
          invoiceTotalKd: '15.000',
          posPaymentMethod: 'CASH',
          occurredAt: new Date().toISOString(),
        },
      });
    });

    expect(financialCache.getEntry(scopedKey).fetchedAt).toBe(0);
    expect(financialCache.getEntry(broadKey).fetchedAt).toBe(0);
  });

  test('2. payload financial values are NEVER copied into the cache', async () => {
    const scopedKey = keyOf(['finance:invoices', 'cust-A']);
    financialCache.setQueryData(scopedKey, { rows: ['canonical-old'] });

    renderHook(() =>
      useRealtimeFinancialFeed({
        channel: 'customer360',
        customerId: 'cust-A',
        accessToken: 'jwt-test',
      }),
    );
    await new Promise((r) => setTimeout(r, 5));
    const es = FakeEventSource.instances[0];

    act(() => {
      es.__emit('finance:event', {
        channel: 'customer360',
        eventName: 'finance.invoice.issued',
        customerId: 'cust-A',
        branchId: null,
        at: new Date().toISOString(),
        payload: { invoiceTotalKd: '999999.999' }, // would be wrong if applied
      });
    });

    // Only the staleness mark moved — the underlying cached value
    // is unchanged. The next useFinancialQuery() will refetch the
    // server-canonical row.
    const entry = financialCache.getEntry<{ rows: string[] }>(scopedKey);
    expect(entry.data).toEqual({ rows: ['canonical-old'] });
    expect(entry.fetchedAt).toBe(0);
  });

  test('3. auto-reconnect: EventSource error increments reconnect counter', async () => {
    const { result } = renderHook(() =>
      useRealtimeFinancialFeed({
        channel: 'collections',
        accessToken: 'jwt-test',
      }),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(result.current.connected).toBe(true);

    await act(async () => {
      FakeEventSource.instances[0].__error();
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(result.current.reconnects).toBe(1);
    expect(result.current.connected).toBe(false);
  });

  test('4. disabling tears down EventSource cleanly', async () => {
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useRealtimeFinancialFeed({
          channel: 'risk',
          accessToken: 'jwt-test',
          enabled,
        }),
      { initialProps: { enabled: true } },
    );
    await new Promise((r) => setTimeout(r, 5));
    const es = FakeEventSource.instances[0];
    expect(es.closed).toBe(false);

    rerender({ enabled: false });
    expect(es.closed).toBe(true);
  });
});
