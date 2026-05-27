import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { uploadDriverLocation } from '@/api/device';
import { useAuth } from '@/auth/auth-context';
import { resolveMobileAppRole } from '@/auth/roles';

const UPLOAD_INTERVAL_MS = 30_000;

export type DriverGpsState = {
  granted: boolean;
  checking: boolean;
  lastUploadedAt: string | null;
  error: string | null;
  requestPermission: () => Promise<boolean>;
};

export function useDriverGps(): DriverGpsState {
  const { user, getValidAccessToken } = useAuth();
  const isDriver =
    user != null && resolveMobileAppRole(user.safariRole) === 'driver';
  const [granted, setGranted] = useState(false);
  const [checking, setChecking] = useState(isDriver);
  const [lastUploadedAt, setLastUploadedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const lastUploadRef = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const uploadCoords = useCallback(
    async (lat: number, lng: number) => {
      const now = Date.now();
      if (now - lastUploadRef.current < UPLOAD_INTERVAL_MS) {
        return;
      }
      if (appStateRef.current !== 'active') {
        return;
      }
      try {
        const token = await getValidAccessToken();
        if (!token) {
          return;
        }
        await uploadDriverLocation(token, `${lat},${lng}`);
        lastUploadRef.current = now;
        setLastUploadedAt(new Date().toISOString());
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'فشل رفع الموقع');
      }
    },
    [getValidAccessToken],
  );

  const requestPermission = useCallback(async () => {
    const result = await Location.requestForegroundPermissionsAsync();
    const ok = result.status === 'granted';
    setGranted(ok);
    return ok;
  }, []);

  const startWatch = useCallback(async () => {
    if (!isDriver) {
      return;
    }
    setChecking(true);
    try {
      const services = await Location.hasServicesEnabledAsync();
      if (!services) {
        setError('فعّل خدمة الموقع على الجهاز');
        setGranted(false);
        return;
      }
      const perm = await Location.requestForegroundPermissionsAsync();
      const ok = perm.status === 'granted';
      setGranted(ok);
      if (!ok) {
        setError('الموقع مطلوب لمهام الميدان');
        return;
      }
      watchRef.current?.remove();
      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 40,
          timeInterval: UPLOAD_INTERVAL_MS,
        },
        (pos) => {
          void uploadCoords(pos.coords.latitude, pos.coords.longitude);
        },
      );
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await uploadCoords(
        current.coords.latitude,
        current.coords.longitude,
      );
    } finally {
      setChecking(false);
    }
  }, [isDriver, uploadCoords]);

  useEffect(() => {
    if (!isDriver) {
      watchRef.current?.remove();
      watchRef.current = null;
      setChecking(false);
      return;
    }
    void startWatch();
    const sub = AppState.addEventListener('change', (next) => {
      appStateRef.current = next;
      if (next === 'active') {
        void startWatch();
      }
    });
    return () => {
      watchRef.current?.remove();
      watchRef.current = null;
      sub.remove();
    };
  }, [isDriver, startWatch]);

  return {
    granted,
    checking,
    lastUploadedAt,
    error,
    requestPermission,
  };
}
