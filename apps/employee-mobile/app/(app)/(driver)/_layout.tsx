import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { resolveMobileAppRole } from '@/auth/roles';
import { ErpBottomTabBar } from '@/components/erp-tab-bar';
import { erpTabScreenOptions } from '@/components/ui';
import { DriverGpsProvider } from '@/device/driver-gps-context';

export default function DriverLayout() {
  const { user } = useAuth();
  if (user && resolveMobileAppRole(user.safariRole) !== 'driver') {
    return <Redirect href="/(app)/unsupported" />;
  }

  return (
    <DriverGpsProvider>
      <Tabs
        screenOptions={erpTabScreenOptions}
        tabBar={(props) => <ErpBottomTabBar {...props} />}
      >
        <Tabs.Screen name="tasks" options={{ title: 'مهامي' }} />
        <Tabs.Screen name="scan" options={{ title: 'مسح' }} />
        <Tabs.Screen name="pending-invoices" options={{ title: 'متابعة' }} />
        <Tabs.Screen name="deposits" options={{ title: 'عهدة' }} />
        <Tabs.Screen name="pos" options={{ title: 'POS' }} />
        <Tabs.Screen name="more" options={{ title: 'المزيد' }} />
        <Tabs.Screen
          name="order/[id]"
          options={{ href: null, title: 'فاتورة' }}
        />
      </Tabs>
    </DriverGpsProvider>
  );
}
