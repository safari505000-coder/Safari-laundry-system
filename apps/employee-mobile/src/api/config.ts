import Constants from 'expo-constants';

/**
 * API base URL for staff endpoints.
 * Override via app.json extra.apiBaseUrl or EXPO_PUBLIC_API_URL.
 */
export function getApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');
  if (fromEnv) {
    return fromEnv.endsWith('/api') ? fromEnv : `${fromEnv}/api`;
  }
  const fromExtra = Constants.expoConfig?.extra?.apiBaseUrl as string | undefined;
  if (fromExtra?.trim()) {
    return fromExtra.trim().replace(/\/$/, '');
  }
  return 'http://localhost:3000/api';
}
