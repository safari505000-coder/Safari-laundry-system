import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { resolveMobileAppRole } from '@/auth/roles';
import { DriverGpsProvider } from '@/device/driver-gps-context';

export default function DriverLayout() {
  const { user } = useAuth();
  const role = user ? resolveMobileAppRole(user.safariRole) : null;
  if (role !== 'driver' && role !== 'manager') {
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
