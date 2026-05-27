import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { resolveMobileAppRole } from '@/auth/roles';
import { ErpBottomTabBar } from '@/components/erp-tab-bar';
import { erpTabScreenOptions } from '@/components/ui';

export default function CallCenterLayout() {
  const { user } = useAuth();
  if (user && resolveMobileAppRole(user.safariRole) !== 'call-center') {
    return <Redirect href="/(app)/unsupported" />;
  }

  return (
    <Tabs
      screenOptions={erpTabScreenOptions}
      tabBar={(props) => <ErpBottomTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: 'بحث' }} />
      <Tabs.Screen name="collections" options={{ title: 'تحصيل' }} />
      <Tabs.Screen name="website-orders" options={{ title: 'طلبات' }} />
      <Tabs.Screen name="website-payments" options={{ title: 'مدفوعات' }} />
      <Tabs.Screen
        name="customer/[id]"
        options={{ href: null, title: 'عميل' }}
      />
    </Tabs>
  );
}
