import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { LoginUser, SafariRole } from '@/lib/api';
import {
  postLogin,
  postLogout,
  postRefreshToken,
  setTokenRefreshHandler,
} from '@/lib/api';

const TOKEN_KEY = 'safari_erp_token';
const REFRESH_TOKEN_KEY = 'safari_erp_refresh_token';
const USER_KEY = 'safari_erp_user';
const OWNER_BRANCH_KEY = 'safari_erp_owner_branch_id';
const RBAC_POLICY_VERSION_KEY = 'safari_erp_rbac_policy_version';
const RBAC_POLICY_VERSION = 'customer-360-portal-v1';
/** V19.29 — "Remember me": only the username is persisted, never the password. */
const REMEMBER_USERNAME_KEY = 'safari_erp_remember_username';

type AuthContextValue = {
  token: string | null;
  user: LoginUser | null;
  /**
   * `rememberMe=true` keeps the username in localStorage for next launch.
   * Password is never stored.
   */
  login: (
    username: string,
    password: string,
    rememberMe?: boolean,
  ) => Promise<LoginUser>;
  logout: () => void;
  hasRole: (...roles: SafariRole[]) => boolean;
  /** OWNER: filter reports/expenses to one branch; `null` = all branches. */
  ownerBranchId: string | null;
  setOwnerBranchId: (branchId: string | null) => void;
  /** V19.29 — pre-fill the login form with the last saved username. */
  rememberedUsername: string;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredUser(): LoginUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LoginUser;
  } catch {
    return null;
  }
}

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function readStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function readRememberedUsername(): string {
  try {
    return localStorage.getItem(REMEMBER_USERNAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function readOwnerBranchId(): string | null {
  try {
    const v = localStorage.getItem(OWNER_BRANCH_KEY);
    if (!v || v === 'ALL') return null;
    return v;
  } catch {
    return null;
  }
}

function ensureFreshRbacPolicy(): void {
  try {
    if (localStorage.getItem(RBAC_POLICY_VERSION_KEY) === RBAC_POLICY_VERSION) {
      return;
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(OWNER_BRANCH_KEY);
    localStorage.setItem(RBAC_POLICY_VERSION_KEY, RBAC_POLICY_VERSION);
  } catch {
    /* storage disabled — login will refresh permissions in memory */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  ensureFreshRbacPolicy();
  const [token, setToken] = useState<string | null>(readStoredToken);
  const [user, setUser] = useState<LoginUser | null>(readStoredUser);
  const [ownerBranchId, setOwnerBranchIdState] = useState<string | null>(
    readOwnerBranchId,
  );
  const [rememberedUsername] = useState<string>(readRememberedUsername);
  /*
   * Refresh token lives in a ref so `apiJson` can always read the latest
   * single-use value after rotation without waiting for a React re-render.
   */
  const refreshTokenRef = useRef<string | null>(readStoredRefreshToken());

  const persistSession = useCallback(
    (
      newAccessToken: string,
      newRefreshToken: string,
      nextUser?: LoginUser,
    ) => {
      try {
        localStorage.setItem(TOKEN_KEY, newAccessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
        localStorage.setItem(RBAC_POLICY_VERSION_KEY, RBAC_POLICY_VERSION);
        if (nextUser) {
          localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
        }
      } catch {
        /* storage quota / disabled — session stays in memory */
      }
      refreshTokenRef.current = newRefreshToken;
      setToken(newAccessToken);
      if (nextUser) setUser(nextUser);
    },
    [],
  );

  const clearSession = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(OWNER_BRANCH_KEY);
    } catch {
      /* ignore */
    }
    refreshTokenRef.current = null;
    setToken(null);
    setUser(null);
    setOwnerBranchIdState(null);
  }, []);

  const login = useCallback(
    async (username: string, password: string, rememberMe = true) => {
      const res = await postLogin(username, password);
      persistSession(res.accessToken, res.refreshToken, res.user);
      try {
        if (rememberMe) {
          localStorage.setItem(REMEMBER_USERNAME_KEY, username.trim());
        } else {
          localStorage.removeItem(REMEMBER_USERNAME_KEY);
        }
      } catch {
        /* ignore */
      }
      if (res.user.safariRole !== 'OWNER') {
        try {
          localStorage.removeItem(OWNER_BRANCH_KEY);
        } catch {
          /* ignore */
        }
        setOwnerBranchIdState(null);
      }
      return res.user;
    },
    [persistSession],
  );

  const setOwnerBranchId = useCallback((branchId: string | null) => {
    setOwnerBranchIdState(branchId);
    try {
      if (branchId === null) {
        localStorage.removeItem(OWNER_BRANCH_KEY);
      } else {
        localStorage.setItem(OWNER_BRANCH_KEY, branchId);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const logout = useCallback(() => {
    const rt = refreshTokenRef.current;
    if (rt) {
      void postLogout(rt);
    }
    clearSession();
  }, [clearSession]);

  /*
   * V19.29 — Wire a single global refresh handler. apiJson will call this
   * whenever an authenticated request gets 401. We redeem the stored refresh
   * token for a new access token (and a rotated refresh token) and return the
   * new access. On failure (invalid / expired / revoked) we clear the session
   * so the app naturally falls back to the login screen.
   */
  useEffect(() => {
    setTokenRefreshHandler(async () => {
      const rt = refreshTokenRef.current;
      if (!rt) return null;
      try {
        const fresh = await postRefreshToken(rt);
        persistSession(fresh.accessToken, fresh.refreshToken);
        return fresh.accessToken;
      } catch {
        clearSession();
        return null;
      }
    });
    return () => {
      setTokenRefreshHandler(null);
    };
  }, [persistSession, clearSession]);

  const hasRole = useCallback(
    (...roles: SafariRole[]) => {
      if (!user) return false;
      return roles.includes(user.safariRole);
    },
    [user],
  );

  const value = useMemo(
    () => ({
      token,
      user,
      login,
      logout,
      hasRole,
      ownerBranchId,
      setOwnerBranchId,
      rememberedUsername,
    }),
    [
      token,
      user,
      login,
      logout,
      hasRole,
      ownerBranchId,
      setOwnerBranchId,
      rememberedUsername,
    ],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
