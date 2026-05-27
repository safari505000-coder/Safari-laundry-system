import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { registerEmployeePushToken } from '@/api/device';
import { useAuth } from '@/auth/auth-context';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function resolveExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return null;
  }
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  const token = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  return token.data;
}

export function usePushRegistration() {
  const { status, getValidAccessToken } = useAuth();
  const registeredRef = useRef<string | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const pushToken = await resolveExpoPushToken();
        if (!pushToken || cancelled || registeredRef.current === pushToken) {
          return;
        }
        const jwt = await getValidAccessToken();
        if (!jwt || cancelled) {
          return;
        }
        await registerEmployeePushToken(
          jwt,
          pushToken,
          Platform.OS === 'ios' ? 'ios' : 'android',
        );
        registeredRef.current = pushToken;
      } catch {
        // Non-blocking — dispatch/tasks still work without push.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, getValidAccessToken]);
}
