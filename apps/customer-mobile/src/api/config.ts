import Constants from 'expo-constants';

export function getApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');
  if (fromEnv) {
    return fromEnv.endsWith('/api') ? fromEnv : `${fromEnv}/api`;
  }
  const fromExtra = Constants.expoConfig?.extra?.apiBaseUrl as string | undefined;
  if (fromExtra?.trim()) {
    const trimmed = fromExtra.trim().replace(/\/$/, '');
    const hostUri = Constants.expoConfig?.hostUri;
    const host = hostUri?.split(':')[0];
    if (host && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api$/.test(trimmed)) {
      return `http://${host}:3000/api`;
    }
    return trimmed;
  }
  return 'http://localhost:3000/api';
}
