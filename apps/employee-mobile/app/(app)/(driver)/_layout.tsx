import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { resolveMobileAppRole } from '@/auth/roles';
import { DriverGpsProvider } from '@/device/driver-gps-context';

export default function DriverLayout() {
  const { user } = useAuth();
  if (user && resolveMobileAppRole(user.safariRole) !== 'driver') {
    return <Redirect href="/(app)/unsupported" />;
  }

  return (
    <DriverGpsProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="order/[id]" />
      </Stack>
    </DriverGpsProvider>
  );
}
