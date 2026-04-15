import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { LoginUser, SafariRole } from '@/lib/api';
import { postLogin } from '@/lib/api';

const TOKEN_KEY = 'safari_erp_token';
const USER_KEY = 'safari_erp_user';
const OWNER_BRANCH_KEY = 'safari_erp_owner_branch_id';

type AuthContextValue = {
  token: string | null;
  user: LoginUser | null;
  login: (username: string, password: string) => Promise<LoginUser>;
  logout: () => void;
  hasRole: (...roles: SafariRole[]) => boolean;
  /** OWNER: filter reports/expenses to one branch; `null` = all branches. */
  ownerBranchId: string | null;
  setOwnerBranchId: (branchId: string | null) => void;
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

function readOwnerBranchId(): string | null {
  try {
    const v = localStorage.getItem(OWNER_BRANCH_KEY);
    if (!v || v === 'ALL') return null;
    return v;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(readStoredToken);
  const [user, setUser] = useState<LoginUser | null>(readStoredUser);
  const [ownerBranchId, setOwnerBranchIdState] = useState<string | null>(
    readOwnerBranchId,
  );

  const login = useCallback(async (username: string, password: string) => {
    const res = await postLogin(username, password);
    localStorage.setItem(TOKEN_KEY, res.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    setToken(res.accessToken);
    setUser(res.user);
    if (res.user.safariRole !== 'OWNER') {
      try {
        localStorage.removeItem(OWNER_BRANCH_KEY);
      } catch {
        /* ignore */
      }
      setOwnerBranchIdState(null);
    }
    return res.user;
  }, []);

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
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(OWNER_BRANCH_KEY);
    setToken(null);
    setUser(null);
    setOwnerBranchIdState(null);
  }, []);

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
    }),
    [token, user, login, logout, hasRole, ownerBranchId, setOwnerBranchId],
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
