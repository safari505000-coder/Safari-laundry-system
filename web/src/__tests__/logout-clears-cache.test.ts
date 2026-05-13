/**
 * Tests for clearOfflineDb() and its integration with the auth context.
 *
 * Coverage:
 *  1. logout() triggers clearOfflineDb()
 *  2. JWT refresh failure triggers clearOfflineDb()
 *  3. clearOfflineDb() clears all 3 Dexie tables
 *  4. Error in Dexie.clear() is swallowed silently
 *
 * Dexie mocking strategy
 * ──────────────────────
 * SafariOfflineQueueDb declares `pendingMutations!: Table<...>` etc. as
 * class fields. In ES2022+ (useDefineForClassFields: true), TypeScript
 * emits these as native class field definitions that set `undefined`
 * AFTER the parent constructor runs — so simply initialising them in
 * the MockDexie parent class does not help.
 *
 * The fix is two-step:
 *  a) Mock Dexie so the constructor does not try to open real IndexedDB.
 *  b) After the singleton is created, assign our vi.fn() stubs directly
 *     to the instance properties. Then the real clearOfflineDb(), which
 *     calls getOfflineQueueDb() (same singleton), picks up our stubs.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Dexie mock — prevent real IndexedDB I/O ──────────────────────────────────

vi.mock('dexie', () => ({
  default: class MockDexie {
    version() {
      return { stores: () => undefined };
    }
  },
  Table: class {},
}));

// ─── API mock for AuthProvider ────────────────────────────────────────────────

const mockSetTokenRefreshHandler = vi.fn<[Function | null], void>();
const mockPostLogout = vi.fn<[string], Promise<void>>().mockResolvedValue(undefined);
const mockPostRefreshToken = vi.fn<
  [string],
  Promise<{ accessToken: string; refreshToken: string }>
>();

vi.mock('@/lib/api', () => ({
  postLogin: vi.fn(),
  postLogout: (...args: unknown[]) => mockPostLogout(args[0] as string),
  postRefreshToken: (...args: unknown[]) =>
    mockPostRefreshToken(args[0] as string),
  setTokenRefreshHandler: (...args: unknown[]) =>
    mockSetTokenRefreshHandler(args[0] as Function | null),
  postChangePassword: vi.fn(),
}));

// ─── Module imports ────────────────────────────────────────────────────────────

import { clearOfflineDb, getOfflineQueueDb } from '@/offline/pending-mutation-db';
import * as offlineDbModule from '@/offline/pending-mutation-db';
import { AuthProvider, useAuth } from '@/contexts/auth-context';

// Internal constants mirrored from auth-context (keep in sync if bumped).
const RBAC_POLICY_VERSION_KEY = 'safari_erp_rbac_policy_version';
const RBAC_POLICY_VERSION = 'customer-360-portal-v1';
const REFRESH_TOKEN_KEY = 'safari_erp_refresh_token';

// ─── Shared setup ─────────────────────────────────────────────────────────────

function seedRbacVersion() {
  localStorage.setItem(RBAC_POLICY_VERSION_KEY, RBAC_POLICY_VERSION);
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// ─── Helper: inject mock table stubs into the Dexie singleton ─────────────────
//
// Because ES2022 native class fields set SafariOfflineQueueDb's table
// properties to `undefined` AFTER the MockDexie parent constructor runs,
// we assign them manually after obtaining the singleton instance.
// clearOfflineDb() calls getOfflineQueueDb() which returns the SAME
// singleton, so the injected stubs are picked up correctly.

function injectTableMocks() {
  const pendingClear = vi.fn<[], Promise<void>>().mockResolvedValue(undefined);
  const customersClear = vi.fn<[], Promise<void>>().mockResolvedValue(undefined);
  const posClear = vi.fn<[], Promise<void>>().mockResolvedValue(undefined);

  const db = getOfflineQueueDb();
  // Cast away the !: undefined that ES2022 class fields impose.
  (db as any).pendingMutations = { clear: pendingClear };
  (db as any).customersCache = { clear: customersClear };
  (db as any).posMetadata = { clear: posClear };

  return { pendingClear, customersClear, posClear };
}

// ─── Case 3 & 4 — clearOfflineDb() direct unit tests ─────────────────────────

describe('clearOfflineDb() — direct unit tests', () => {
  let pendingClear: ReturnType<typeof vi.fn>;
  let customersClear: ReturnType<typeof vi.fn>;
  let posClear: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    ({ pendingClear, customersClear, posClear } = injectTableMocks());
  });

  it('clears all 3 Dexie tables (pendingMutations, customersCache, posMetadata)', async () => {
    await clearOfflineDb();

    expect(pendingClear).toHaveBeenCalledOnce();
    expect(customersClear).toHaveBeenCalledOnce();
    expect(posClear).toHaveBeenCalledOnce();
  });

  it('clears all tables on every call', async () => {
    await clearOfflineDb();
    await clearOfflineDb();

    expect(pendingClear).toHaveBeenCalledTimes(2);
    expect(customersClear).toHaveBeenCalledTimes(2);
    expect(posClear).toHaveBeenCalledTimes(2);
  });

  it('swallows error from pendingMutations.clear() silently', async () => {
    (pendingClear as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('IndexedDB unavailable'),
    );

    // Promise.allSettled inside clearOfflineDb swallows the error.
    await expect(clearOfflineDb()).resolves.toBeUndefined();
  });

  it('swallows error from customersCache.clear() and still clears the other tables', async () => {
    (customersClear as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('quota exceeded'),
    );

    await expect(clearOfflineDb()).resolves.toBeUndefined();
    // pendingMutations and posMetadata must still have been attempted.
    expect(pendingClear).toHaveBeenCalledOnce();
    expect(posClear).toHaveBeenCalledOnce();
  });

  it('swallows error from posMetadata.clear() silently', async () => {
    (posClear as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('transaction aborted'),
    );

    await expect(clearOfflineDb()).resolves.toBeUndefined();
    expect(pendingClear).toHaveBeenCalledOnce();
    expect(customersClear).toHaveBeenCalledOnce();
  });

  it('resolves even if all 3 tables fail', async () => {
    (pendingClear as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('fail 1'),
    );
    (customersClear as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('fail 2'),
    );
    (posClear as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('fail 3'),
    );

    await expect(clearOfflineDb()).resolves.toBeUndefined();
  });
});

// ─── Case 1 — logout() triggers clearOfflineDb() ─────────────────────────────

describe('logout() triggers clearOfflineDb()', () => {
  it('calls clearOfflineDb when the user logs out', () => {
    seedRbacVersion();
    const spy = vi
      .spyOn(offlineDbModule, 'clearOfflineDb')
      .mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    act(() => {
      result.current.logout();
    });

    expect(spy).toHaveBeenCalledOnce();
  });

  it('resets auth state (token / user) to null on logout', () => {
    seedRbacVersion();
    vi.spyOn(offlineDbModule, 'clearOfflineDb').mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    act(() => {
      result.current.logout();
    });

    expect(result.current.token).toBeNull();
    expect(result.current.user).toBeNull();
  });
});

// ─── Case 2 — JWT refresh failure triggers clearOfflineDb() ──────────────────

describe('JWT refresh failure triggers clearOfflineDb()', () => {
  async function renderAndCaptureRefreshHandler() {
    let captured: (() => Promise<string | null>) | null = null;
    mockSetTokenRefreshHandler.mockImplementation((h) => {
      if (typeof h === 'function') {
        captured = h as () => Promise<string | null>;
      }
    });

    renderHook(() => useAuth(), { wrapper: AuthProvider });

    // Wait for useEffect to register the handler.
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 0));
    });

    return captured;
  }

  it('calls clearOfflineDb when postRefreshToken throws', async () => {
    seedRbacVersion();
    localStorage.setItem(REFRESH_TOKEN_KEY, 'stale-refresh-token');

    const spy = vi
      .spyOn(offlineDbModule, 'clearOfflineDb')
      .mockResolvedValue(undefined);
    mockPostRefreshToken.mockRejectedValue(new Error('Token revoked'));

    const handler = await renderAndCaptureRefreshHandler();
    expect(handler).not.toBeNull();

    const result = await handler!();

    expect(result).toBeNull();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('does NOT call clearOfflineDb when token refresh succeeds', async () => {
    seedRbacVersion();
    localStorage.setItem(REFRESH_TOKEN_KEY, 'valid-refresh-token');

    const spy = vi
      .spyOn(offlineDbModule, 'clearOfflineDb')
      .mockResolvedValue(undefined);
    mockPostRefreshToken.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });

    const handler = await renderAndCaptureRefreshHandler();
    const token = await handler!();

    expect(token).toBe('new-access-token');
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns null without calling clearOfflineDb when no refresh token is stored', async () => {
    seedRbacVersion();
    // No refresh token → refreshTokenRef.current = null → handler returns early.
    const spy = vi
      .spyOn(offlineDbModule, 'clearOfflineDb')
      .mockResolvedValue(undefined);

    const handler = await renderAndCaptureRefreshHandler();
    const result = await handler!();

    expect(result).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
