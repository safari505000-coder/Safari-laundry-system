import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { loginStaff, logoutStaff, refreshStaffToken } from '@/api/auth';
import type { LoginRequest, StaffUser } from '@/api/types';
import {
  clearSession,
  readSession,
  updateTokens,
  writeSession,
} from '@/auth/session';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthContextValue = {
  status: AuthStatus;
  user: StaffUser | null;
  accessToken: string | null;
  signIn: (payload: LoginRequest) => Promise<void>;
  signOut: () => Promise<void>;
  getValidAccessToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<StaffUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await readSession();
      if (cancelled) return;
      if (session) {
        setUser(session.user);
        setAccessToken(session.accessToken);
        setRefreshToken(session.refreshToken);
        setStatus('authenticated');
      } else {
        setStatus('unauthenticated');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (payload: LoginRequest) => {
    const res = await loginStaff(payload);
    if (res.requiresPasswordChange) {
      throw new Error('يجب تغيير كلمة المرور من نظام الويب أولاً.');
    }
    if (!res.accessToken || !res.refreshToken) {
      throw new Error('تعذر إنشاء جلسة. حاول مرة أخرى.');
    }
    await writeSession({
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      user: res.user,
    });
    setUser(res.user);
    setAccessToken(res.accessToken);
    setRefreshToken(res.refreshToken);
    setStatus('authenticated');
  }, []);

  const signOut = useCallback(async () => {
    await logoutStaff(refreshToken);
    await clearSession();
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    setStatus('unauthenticated');
  }, [refreshToken]);

  const getValidAccessToken = useCallback(async () => {
    if (accessToken) {
      return accessToken;
    }
    const session = await readSession();
    if (!session) {
      return null;
    }
    setAccessToken(session.accessToken);
    setRefreshToken(session.refreshToken);
    setUser(session.user);
    return session.accessToken;
  }, [accessToken]);

  const refreshIfNeeded = useCallback(async (): Promise<string | null> => {
    const currentRefresh = refreshToken ?? (await readSession())?.refreshToken;
    if (!currentRefresh) {
      await signOut();
      return null;
    }
    try {
      const fresh = await refreshStaffToken(currentRefresh);
      await updateTokens(fresh.accessToken, fresh.refreshToken);
      setAccessToken(fresh.accessToken);
      setRefreshToken(fresh.refreshToken);
      return fresh.accessToken;
    } catch {
      await signOut();
      return null;
    }
  }, [refreshToken, signOut]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      accessToken,
      signIn,
      signOut,
      getValidAccessToken: async () => {
        const token = await getValidAccessToken();
        if (token) {
          return token;
        }
        return refreshIfNeeded();
      },
    }),
    [
      status,
      user,
      accessToken,
      signIn,
      signOut,
      getValidAccessToken,
      refreshIfNeeded,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
