import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
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

async function resolveExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) {
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
  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch {
    return null;
  }
}

export async function registerCustomerPushIfPossible(
  phone: string,
): Promise<void> {
  const normalized = phone.replace(/[\s-]/g, '').trim();
  if (normalized.length < 8) {
    return;
  }
  const pushToken = await resolveExpoPushToken();
  if (!pushToken) {
    return;
  }
  await registerCustomerPushToken({
    customerPhone: normalized,
    token: pushToken,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  });
}

export function useCustomerPushRegistration() {
  const registeredRef = useRef<string | null>(null);

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
    void (async () => {
      try {
        const phone = await readSavedPhone();
        if (!phone || cancelled) {
          return;
        }
        const pushToken = await resolveExpoPushToken();
        if (!pushToken || cancelled || registeredRef.current === pushToken) {
          return;
        }
        await registerCustomerPushToken({
          customerPhone: phone,
          token: pushToken,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
        });
        registeredRef.current = pushToken;
      } catch {
        // Non-blocking until OTP session ships.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
