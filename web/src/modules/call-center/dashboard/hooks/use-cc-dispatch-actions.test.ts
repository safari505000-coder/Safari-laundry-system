/**
 * `useCcDispatchActions` — hook unit suite.
 *
 * Covers the two production scenarios the hook hardens:
 *   - SUCCESS PATH: create returns `{ ok: true, data }` and the
 *     server's row is propagated unchanged.
 *   - BLOCKED CUSTOMER: a 403 CUSTOMER_BLOCKED from the server is
 *     surfaced as `{ ok: false, status: 403, errorCode:
 *     'CUSTOMER_BLOCKED' }` so the dialog can render the Arabic
 *     toast "العميل محظور، لا يمكن إنشاء مهمة".
 *   - SESSION GONE: missing token short-circuits without a network
 *     call.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api';

const tokenRef: { token: string | null } = { token: 'tok_abc' };
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => tokenRef,
}));

const apiJson = vi.fn();
vi.mock('@/lib/api', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    apiJson: (...args: unknown[]) => apiJson(...args),
  };
});

import { useCcDispatchActions } from './use-cc-dispatch-actions';

beforeEach(() => {
  apiJson.mockReset();
  tokenRef.token = 'tok_abc';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCcDispatchActions.create — success path', () => {
  test('returns ok:true with the persisted row on a 200 response', async () => {
    const persisted = {
      id: 'disp-1',
      customerId: 'c1',
      driverId: 'd1',
      status: 'ASSIGNED',
      severity: 'ON_TIME',
      elapsedMinutes: 0,
      customerDisplay: 'Walk-in',
      customerPhone: '+965999',
      driverName: 'Anan',
      instructionNote: null,
      createdAtIso: new Date().toISOString(),
      completedAtIso: null,
      completedByOrderId: null,
    };
    apiJson.mockResolvedValueOnce(persisted);

    const { result } = renderHook(() => useCcDispatchActions());

    let outcome:
      | Awaited<ReturnType<typeof result.current.create>>
      | undefined;
    await act(async () => {
      outcome = await result.current.create({
        customerId: 'c1',
        driverId: 'd1',
      });
    });

    expect(outcome).toEqual({ ok: true, data: persisted });
    await waitFor(() => expect(result.current.submitting).toBe(false));
  });
});

describe('useCcDispatchActions.create — blocked customer (403)', () => {
  test('surfaces 403 CUSTOMER_BLOCKED so the dialog can render the Arabic toast', async () => {
    apiJson.mockRejectedValueOnce(
      new ApiError(
        'العميل محظور حالياً ولا يمكن إصدار مهمة',
        403,
        'CUSTOMER_BLOCKED',
      ),
    );

    const { result } = renderHook(() => useCcDispatchActions());

    let outcome:
      | Awaited<ReturnType<typeof result.current.create>>
      | undefined;
    await act(async () => {
      outcome = await result.current.create({
        customerId: 'c1',
        driverId: 'd1',
      });
    });

    expect(outcome).toEqual({
      ok: false,
      error: 'العميل محظور حالياً ولا يمكن إصدار مهمة',
      status: 403,
      errorCode: 'CUSTOMER_BLOCKED',
    });
  });
});

describe('useCcDispatchActions.create — no session', () => {
  test('returns an Arabic session-expired error WITHOUT calling the network', async () => {
    tokenRef.token = null;

    const { result } = renderHook(() => useCcDispatchActions());

    let outcome:
      | Awaited<ReturnType<typeof result.current.create>>
      | undefined;
    await act(async () => {
      outcome = await result.current.create({
        customerId: 'c1',
        driverId: 'd1',
      });
    });

    expect(outcome).toEqual({
      ok: false,
      error: 'انتهت الجلسة. سجّل الدخول من جديد.',
    });
    expect(apiJson).not.toHaveBeenCalled();
  });
});

describe('useCcDispatchActions.reassign — surfaces ApiError fields', () => {
  test('400 DRIVER_UNCHANGED is propagated to the caller verbatim', async () => {
    apiJson.mockRejectedValueOnce(
      new ApiError('السائق نفسه — لا حاجة لإعادة الإسناد', 400, 'DRIVER_UNCHANGED'),
    );

    const { result } = renderHook(() => useCcDispatchActions());

    let outcome:
      | Awaited<ReturnType<typeof result.current.reassign>>
      | undefined;
    await act(async () => {
      outcome = await result.current.reassign('disp-1', { newDriverId: 'd1' });
    });

    expect(outcome).toEqual({
      ok: false,
      error: 'السائق نفسه — لا حاجة لإعادة الإسناد',
      status: 400,
      errorCode: 'DRIVER_UNCHANGED',
    });
  });
});
