import { apiJson } from './client';

export function uploadDriverLocation(
  token: string,
  lastKnownLocation: string,
): Promise<{ id: string }> {
  return apiJson('/finance/driver/location', {
    method: 'PATCH',
    token,
    body: JSON.stringify({ lastKnownLocation }),
  });
}

export function registerEmployeePushToken(
  token: string,
  expoPushToken: string,
  platform?: 'ios' | 'android',
): Promise<{ ok: true; registeredAt: string }> {
  return apiJson('/public/employee/push-token', {
    method: 'POST',
    token,
    body: JSON.stringify({ token: expoPushToken, platform }),
  });
}
