/**
 * Unit suite for the call-center API client.
 *
 * The point of these tests is NOT to retest fetch (the platform owns
 * that) — it is to lock down the URL contract and the request
 * envelope: every endpoint must hit the documented path with the
 * right method, body, and bearer token. A regression here usually
 * indicates a path-prefix typo or a missed `JSON.stringify`, both of
 * which are otherwise easy to miss in a JSX-heavy diff.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  blockCustomer,
  createDispatch,
  listActiveDispatches,
  listCcDrivers,
  reassignDispatch,
  unblockCustomer,
  type CcDriverRow,
  type DispatchRow,
  type DispatchSnapshot,
} from './cc-dashboard-api';

const TOKEN = 'tok_abc123';

/**
 * `apiJson` peels the `{ data }` envelope before resolving — every
 * server response in this codebase is wrapped in `{ data: ... }`,
 * so the mock has to mirror that shape or the helper throws
 * "Invalid API response (missing data)".
 */
function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastCall(): { url: string; init: RequestInit } {
  const call = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
  if (!call) throw new Error('fetch was never called');
  const [url, init] = call as [string, RequestInit | undefined];
  return { url, init: init ?? {} };
}

describe('listCcDrivers', () => {
  test('GETs /api/call-center/drivers with the bearer token', async () => {
    const driver: CcDriverRow = {
      id: 'd1',
      name: 'Anan',
      isActive: true,
      activeLoad: 0,
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse([driver]));

    const result = await listCcDrivers(TOKEN);

    expect(result).toEqual([driver]);
    const { url, init } = lastCall();
    expect(url).toContain('/api/call-center/drivers');
    expect(init.method).toBeUndefined();
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    expect(headers.get('Cache-Control')).toBe('no-cache');
  });

  test('returns the empty array verbatim when the server reports zero drivers', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse([]));
    await expect(listCcDrivers(TOKEN)).resolves.toEqual([]);
  });

  test('forwards the AbortSignal so the caller can cancel a stale request', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse([]));
    const ctrl = new AbortController();
    await listCcDrivers(TOKEN, { signal: ctrl.signal });
    const { init } = lastCall();
    expect(init.signal).toBe(ctrl.signal);
  });
});

describe('listActiveDispatches', () => {
  test('GETs /api/call-center/dispatch/active with the bearer token', async () => {
    const snapshot: DispatchSnapshot = {
      generatedAtIso: new Date().toISOString(),
      rows: [],
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse(snapshot));

    await listActiveDispatches(TOKEN);
    const { url, init } = lastCall();
    expect(url).toContain('/api/call-center/dispatch/active');
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    expect(headers.get('Cache-Control')).toBe('no-cache');
  });

  test('appends ?limit when provided', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ generatedAtIso: '', rows: [] }),
    );
    await listActiveDispatches(TOKEN, { limit: 25 });
    expect(lastCall().url).toContain('?limit=25');
  });

  test('drops leaked rows that do not belong on the active board', async () => {
    const snapshot: DispatchSnapshot = {
      generatedAtIso: '2026-01-01T00:00:00.000Z',
      rows: [
        {
          id: 'bad-complete',
          status: 'COMPLETED',
          severity: 'COMPLETED',
          elapsedMinutes: 0,
          customerId: 'c1',
          customerDisplay: 'X',
          customerPhone: '+965',
          driverId: 'd1',
          driverName: 'D',
          instructionNote: null,
          createdAtIso: '2026-01-01T00:00:00.000Z',
          completedAtIso: null,
          completedByOrderId: null,
        },
        {
          id: 'bad-progress',
          status: 'IN_PROGRESS',
          severity: 'ON_TIME',
          elapsedMinutes: 0,
          customerId: 'c1',
          customerDisplay: 'X',
          customerPhone: '+965',
          driverId: 'd1',
          driverName: 'D',
          instructionNote: null,
          createdAtIso: '2026-01-01T00:00:00.000Z',
          completedAtIso: null,
          completedByOrderId: null,
        },
        {
          id: 'good-active',
          status: 'ASSIGNED',
          severity: 'ON_TIME',
          elapsedMinutes: 0,
          customerId: 'c1',
          customerDisplay: 'X',
          customerPhone: '+965',
          driverId: 'd1',
          driverName: 'D',
          instructionNote: null,
          createdAtIso: '2026-01-01T00:00:00.000Z',
          completedAtIso: null,
          completedByOrderId: null,
        },
      ] as DispatchRow[],
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse(snapshot));

    const out = await listActiveDispatches(TOKEN);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].id).toBe('good-active');
  });
});

describe('createDispatch', () => {
  test('POSTs the JSON body and resolves with the row on success', async () => {
    const row: Partial<DispatchRow> = {
      id: 'disp-1',
      status: 'ASSIGNED',
      severity: 'ON_TIME',
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse(row));

    const out = await createDispatch(TOKEN, {
      customerId: 'c1',
      driverId: 'd1',
      instructionNote: 'بريد سريع',
    });

    expect(out).toMatchObject(row);
    const { url, init } = lastCall();
    expect(url).toContain('/api/call-center/dispatch');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(
      JSON.stringify({
        customerId: 'c1',
        driverId: 'd1',
        instructionNote: 'بريد سريع',
      }),
    );
  });
});

describe('reassignDispatch', () => {
  test('POSTs to /:id/reassign with the new driver in the body', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'disp-2' }));
    await reassignDispatch(TOKEN, 'disp-old', {
      newDriverId: 'd2',
      reason: 'تأخّر',
    });
    const { url, init } = lastCall();
    expect(url).toContain('/api/call-center/dispatch/disp-old/reassign');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      newDriverId: 'd2',
      reason: 'تأخّر',
    });
  });
});

describe('blockCustomer / unblockCustomer', () => {
  test('block POSTs /api/customers/:id/block with the reason', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        id: 'c1',
        isBlocked: true,
        blockReason: 'دين متأخّر',
        blockedAt: new Date().toISOString(),
      }),
    );
    await blockCustomer(TOKEN, 'c1', { reason: 'دين متأخّر' });
    const { url, init } = lastCall();
    expect(url).toContain('/api/customers/c1/block');
    expect(init.method).toBe('POST');
  });

  test('unblock POSTs /api/customers/:id/unblock', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        id: 'c1',
        isBlocked: false,
        blockReason: null,
        blockedAt: null,
      }),
    );
    await unblockCustomer(TOKEN, 'c1', { reason: 'تسوية' });
    const { url, init } = lastCall();
    expect(url).toContain('/api/customers/c1/unblock');
    expect(init.method).toBe('POST');
  });
});
