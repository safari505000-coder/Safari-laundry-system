import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { resolveMobileAppRole } from '@/auth/roles';
import { brand } from '@/theme/brand';

export default function ManagerLayout() {
  const { user } = useAuth();
  if (user && resolveMobileAppRole(user.safariRole) !== 'manager') {
    return <Redirect href="/(app)/unsupported" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: brand.colors.success,
        tabBarInactiveTintColor: brand.colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'ملخص' }} />
      <Tabs.Screen name="oversight" options={{ title: 'سائقين' }} />
      <Tabs.Screen name="custody" options={{ title: 'عهدة' }} />
    </Tabs>
  );
}
