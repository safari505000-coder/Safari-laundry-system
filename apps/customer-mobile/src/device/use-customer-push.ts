import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { registerCustomerPushToken } from '@/api/public';
import { readSavedPhone } from '@/auth/customer-session';
import { openOrderDeliveryTrack } from '@/lib/routes';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let lastRegisteredKey: string | null = null;

function registrationKey(phone: string, pushToken: string): string {
  return `${phone}:${pushToken}`;
}

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
  try {
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return token.data;
  } catch {
    return null;
  }
}

async function syncCustomerPushFromPhone(phone: string): Promise<void> {
  const normalized = phone.replace(/[\s-]/g, '').trim();
  if (normalized.length < 8) {
    return;
  }
  const pushToken = await resolveExpoPushToken();
  if (!pushToken) {
    return;
  }
  const key = registrationKey(normalized, pushToken);
  if (lastRegisteredKey === key) {
    return;
  }
  await registerCustomerPushToken({
    customerPhone: normalized,
    token: pushToken,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  });
  lastRegisteredKey = key;
}

export async function registerCustomerPushIfPossible(
  phone: string,
): Promise<void> {
  try {
    await syncCustomerPushFromPhone(phone);
  } catch {
    // Non-blocking until permissions or network are ready.
  }
}

async function syncCustomerPushFromSession(): Promise<void> {
  const phone = await readSavedPhone();
  if (!phone) {
    lastRegisteredKey = null;
    return;
  }
  await syncCustomerPushFromPhone(phone);
}

export function useCustomerPushRegistration() {
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const screen = response.notification.request.content.data?.screen;
        const orderId = response.notification.request.content.data?.orderId;
        if (screen === 'order' && typeof orderId === 'string' && orderId.trim()) {
          openOrderDeliveryTrack(orderId.trim());
          return;
        }
        if (screen === 'track') {
          router.push('/(tabs)/track');
        }
      },
    );
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = () => {
      if (cancelled) {
        return;
      }
      void syncCustomerPushFromSession().catch(() => {
        // Non-blocking until OTP session ships.
      });
    };

    run();

    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        run();
      }
    });

    return () => {
      cancelled = true;
      appSub.remove();
    };
  }, []);
}
