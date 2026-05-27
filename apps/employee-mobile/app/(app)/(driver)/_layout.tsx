import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { resolveMobileAppRole } from '@/auth/roles';
import { DriverGpsProvider } from '@/device/driver-gps-context';
import { brand } from '@/theme/brand';

export default function DriverLayout() {
  const { user } = useAuth();
  if (user && resolveMobileAppRole(user.safariRole) !== 'driver') {
    return <Redirect href="/(app)/unsupported" />;
  }

  return (
    <DriverGpsProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: brand.colors.primaryBlue,
          tabBarInactiveTintColor: brand.colors.textMuted,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        }}
      >
        <Tabs.Screen name="tasks" options={{ title: 'مهامي' }} />
        <Tabs.Screen name="scan" options={{ title: 'مسح' }} />
        <Tabs.Screen name="pending-invoices" options={{ title: 'متابعة' }} />
        <Tabs.Screen name="deposits" options={{ title: 'عهدة' }} />
        <Tabs.Screen name="pos" options={{ title: 'POS' }} />
        <Tabs.Screen
          name="order/[id]"
          options={{ href: null, title: 'فاتورة' }}
        />
      </Tabs>
    </DriverGpsProvider>
  );
}
