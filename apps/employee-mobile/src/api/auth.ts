import { apiJson } from './client';
import type {
  LoginRequest,
  LoginResponse,
  RefreshTokenResponse,
} from './types';

export function loginStaff(payload: LoginRequest): Promise<LoginResponse> {
  return apiJson<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function refreshStaffToken(
  refreshToken: string,
): Promise<RefreshTokenResponse> {
  return apiJson<RefreshTokenResponse>('/auth/refresh-token', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}

export function logoutStaff(refreshToken: string | null): Promise<void> {
  if (!refreshToken) {
    return Promise.resolve();
  }
  return apiJson<void>('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  }).catch(() => undefined);
}
