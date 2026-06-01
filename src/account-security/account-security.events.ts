/** Event emitted by AuthService after a successful authentication. */
export const AUTH_LOGIN_SUCCEEDED = 'auth.login.succeeded';

export interface AuthLoginSucceededEvent {
  userId: string;
  username?: string | null;
  role?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceId?: string | null;
  mfaUsed?: boolean;
  /** SHA-256 of the issued refresh token, when available, for session linkage. */
  tokenHash?: string | null;
  expiresAt?: Date | null;
}
