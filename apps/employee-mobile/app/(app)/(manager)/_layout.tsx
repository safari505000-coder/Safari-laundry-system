import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { resolveMobileAppRole } from '@/auth/roles';
import { ErpBottomTabBar } from '@/components/erp-tab-bar';
import { erpTabScreenOptions } from '@/components/ui';

export default function ManagerLayout() {
  const { user } = useAuth();
  if (user && resolveMobileAppRole(user.safariRole) !== 'manager') {
    return <Redirect href="/(app)/unsupported" />;
  }

  return (
    <Tabs
      screenOptions={erpTabScreenOptions}
      tabBar={(props) => <ErpBottomTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: 'ملخص' }} />
      <Tabs.Screen name="oversight" options={{ title: 'سائقين' }} />
      <Tabs.Screen name="custody" options={{ title: 'عهدة' }} />
    </Tabs>
  );
}
