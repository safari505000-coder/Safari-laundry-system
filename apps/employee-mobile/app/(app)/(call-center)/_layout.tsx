import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { resolveMobileAppRole } from '@/auth/roles';
import { brand } from '@/theme/brand';

export default function CallCenterLayout() {
  const { user } = useAuth();
  if (user && resolveMobileAppRole(user.safariRole) !== 'call-center') {
    return <Redirect href="/(app)/unsupported" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: brand.colors.darkBlue,
        tabBarInactiveTintColor: brand.colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
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
