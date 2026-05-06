/**
 * `useCcDrivers` — hook unit suite.
 *
 * Scope (intentionally narrow):
 *   - Initial fetch fires once when a token is available.
 *   - Empty backend response (`[]`) renders the "no drivers" state
 *     without throwing.
 *   - `paused: true` skips the fetch entirely (used by closed
 *     dialogs to keep the network quiet).
 *   - The auth-context dependency is mocked at module level so the
 *     hook can run with a deterministic token in jsdom.
 *   - `apiJson` is replaced with a vi.fn so we never hit the real
 *     network from a unit test.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ token: 'tok_abc' }),
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

import { useCcDrivers } from './use-cc-drivers';

beforeEach(() => {
  apiJson.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCcDrivers', () => {
  test('renders the empty roster path when the backend reports zero drivers', async () => {
    apiJson.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useCcDrivers());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.drivers).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(apiJson).toHaveBeenCalledTimes(1);
  });

  test('exposes the roster verbatim from the server (server is the source of truth for sort order)', async () => {
    const drivers = [
      { id: 'd1', name: 'Anan', isActive: true, activeLoad: 0 },
      { id: 'd2', name: 'Bilal', isActive: true, activeLoad: 3 },
    ];
    apiJson.mockResolvedValueOnce(drivers);

    const { result } = renderHook(() => useCcDrivers());

    await waitFor(() => {
      expect(result.current.drivers).toHaveLength(2);
    });
    expect(result.current.drivers).toEqual(drivers);
  });

  test('does NOT fire a request while paused (dialog closed)', async () => {
    apiJson.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useCcDrivers({ paused: true }));
    // Give the effect a turn to run; paused short-circuits.
    await Promise.resolve();
    expect(apiJson).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.drivers).toEqual([]);
  });

  test('reload() triggers a second request', async () => {
    apiJson.mockResolvedValue([]);
    const { result } = renderHook(() => useCcDrivers());
    await waitFor(() => expect(apiJson).toHaveBeenCalledTimes(1));
    await act(async () => {
      result.current.reload();
    });
    await waitFor(() => expect(apiJson).toHaveBeenCalledTimes(2));
  });
});
