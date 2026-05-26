/**
 * Website order request API client — URL/method/token contract lock.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  listWebsiteOrderRequests,
  updateWebsiteOrderRequestStatus,
} from '@/lib/api';

const TOKEN = 'tok_cc_website';

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

describe('listWebsiteOrderRequests', () => {
  test('GETs /api/public/call-center/website-order-requests with bearer token', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ requests: [] }));

    await listWebsiteOrderRequests(TOKEN);

    const { url, init } = lastCall();
    expect(url).toContain('/api/public/call-center/website-order-requests');
    expect(url).not.toContain('status=');
    expect(init.method).toBeUndefined();
    expect(new Headers(init.headers).get('Authorization')).toBe(
      `Bearer ${TOKEN}`,
    );
  });

  test('passes status filter query param when provided', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ requests: [] }));

    await listWebsiteOrderRequests(TOKEN, { status: 'NEW' });

    const { url } = lastCall();
    expect(url).toContain('status=NEW');
  });
});

describe('updateWebsiteOrderRequestStatus', () => {
  test('POSTs status body to the request status endpoint', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        id: 'req-1',
        publicReference: 'W-00001',
        status: 'CONTACTED',
        reviewedAtIso: '2026-05-26T12:00:00.000Z',
      }),
    );

    const out = await updateWebsiteOrderRequestStatus(
      'req-1',
      'CONTACTED',
      TOKEN,
    );

    expect(out.status).toBe('CONTACTED');
    const { url, init } = lastCall();
    expect(url).toContain(
      '/api/public/call-center/website-order-requests/req-1/status',
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ status: 'CONTACTED' });
    expect(new Headers(init.headers).get('Authorization')).toBe(
      `Bearer ${TOKEN}`,
    );
  });
});
